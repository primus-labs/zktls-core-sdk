#include <condition_variable>
#include <functional>
#include <iostream>
#include <mutex>
#include <napi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string>
#include <vector>

extern "C" {
const char *callAlgorithm(const char *input);
}
std::string __callAlgorithm(const std::string &input) {
  return std::string(callAlgorithm(input.c_str()));
}

using RpcCallback = std::function<char *(const char *)>;
using StreamCallback = std::function<void(const uint8_t *, uint32_t)>;
#ifdef _WIN32
// primus-zk.dll is MinGW/libstdc++ while this addon is MSVC: only plain C
// types may cross the boundary, and rpc result buffers must be freed by the
// CRT that malloc'd them. primus-zk-win.h (shipped with the DLL by pado-core
// and vendored here next to it) is the single source of truth for those
// signatures and ownership rules.
#include "primus-zk-win.h"
#else
extern "C" {
void register_rpc_callback(RpcCallback cb);
void register_stream_callback(StreamCallback cb);
void unregister_rpc_callback();
void unregister_stream_callback();
}
#endif

Napi::ThreadSafeFunction rpc_tsfn;
Napi::ThreadSafeFunction stream_tsfn;
// Guards the two TSFN globals. Trampolines run on DLL worker threads and race
// the JS thread's register/unregister: each trampoline snapshots the wrapper
// and Acquire()s a reference UNDER this lock, so the TSFN cannot finalize
// while a call is in flight (N-API producer protocol), and the JS thread
// swaps the global under the same lock.
std::mutex tsfn_mutex;

// Snapshot + Acquire a TSFN for one producer call; returns an empty wrapper
// if it is unset or already closing.
static Napi::ThreadSafeFunction acquire_tsfn(Napi::ThreadSafeFunction &global) {
  std::lock_guard<std::mutex> lock(tsfn_mutex);
  if (!global)
    return Napi::ThreadSafeFunction();
  Napi::ThreadSafeFunction tsfn = global;
  if (tsfn.Acquire() != napi_ok)
    return Napi::ThreadSafeFunction();
  return tsfn;
}

// Bridges the DLL's rpc request onto the JS thread and returns the response
// as a malloc'd C string (ownership: freed by this addon's CRT — on Windows
// the DLL returns it via the free_result deallocator registered below), or
// nullptr when the handler is unregistered/shutting down or the JS callback
// failed. Captureless/static so it converts to the plain C function pointer
// the Windows DLL boundary requires; wrapped by std::function elsewhere.
static char *rpc_trampoline(const char *msg) {
  Napi::ThreadSafeFunction tsfn = acquire_tsfn(rpc_tsfn);
  if (!tsfn)
    return nullptr;

  std::string _msg(msg);
  struct Context {
    std::mutex m;
    std::condition_variable cv;
    std::string ret;
    bool ok = false;
    bool done = false;
  };

  Context ctx;

  napi_status status =
      tsfn.BlockingCall([&ctx, _msg](Napi::Env env, Napi::Function js_cb) {
        Napi::Value res = js_cb.Call({Napi::String::New(env, _msg)});
        std::string ret;
        bool ok = false;
        // NAPI_DISABLE_CPP_EXCEPTIONS: a JS exception surfaces as a pending
        // exception plus a garbage value, not a C++ throw — clear it and fail
        // this call, but ALWAYS complete the waiter.
        if (env.IsExceptionPending()) {
          env.GetAndClearPendingException();
        } else if (res.IsString()) {
          ret = res.As<Napi::String>().Utf8Value();
          ok = true;
        }
        {
          std::lock_guard<std::mutex> lock(ctx.m);
          ctx.ret = std::move(ret);
          ctx.ok = ok;
          ctx.done = true;
        }
        ctx.cv.notify_one();
      });
  if (status != napi_ok) {
    // Closing/aborted: the lambda never ran and never will — waiting on
    // ctx.done here would hang this DLL worker thread forever.
    tsfn.Release();
    return nullptr;
  }
  {
    std::unique_lock<std::mutex> lock(ctx.m);
    ctx.cv.wait(lock, [&] { return ctx.done; });
  }
  tsfn.Release();
  if (!ctx.ok)
    return nullptr;

  size_t size = ctx.ret.size();
  char *cstr = (char *)malloc(size + 1);
  std::memcpy(cstr, ctx.ret.c_str(), size);
  cstr[size] = '\0';

  return cstr;
}

// Bridges streamed data onto the JS thread; data is copied before queueing.
// Same Acquire/Release producer protocol as rpc_trampoline (no response, so
// a failed BlockingCall just drops this chunk).
static void stream_trampoline(const uint8_t *data, uint32_t len) {
  Napi::ThreadSafeFunction tsfn = acquire_tsfn(stream_tsfn);
  if (!tsfn)
    return;

  std::vector<uint8_t> _data(data, data + len);
  tsfn.BlockingCall(
      [_data = std::move(_data)](Napi::Env env, Napi::Function js_cb) {
        Napi::Buffer<uint8_t> buf =
            Napi::Buffer<uint8_t>::Copy(env, _data.data(), _data.size());
        js_cb.Call({buf});
        if (env.IsExceptionPending())
          env.GetAndClearPendingException();
      });
  tsfn.Release();
}

// JS -> register RPC callback
Napi::Value setRpcHandler(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() == 0 || info[0].IsNull() || info[0].IsUndefined()) {
    // Order matters: unregister first so the DLL stops starting new rpc
    // calls, then drop our reference. In-flight trampolines hold their own
    // Acquire()d references, so the TSFN finalizes only after they Release();
    // do NOT wait for them here — their queued calls need this JS thread back
    // in the event loop, so blocking would deadlock.
    unregister_rpc_callback();
    Napi::ThreadSafeFunction old;
    {
      std::lock_guard<std::mutex> lock(tsfn_mutex);
      old = rpc_tsfn;
      rpc_tsfn = nullptr;
    }
    if (old)
      old.Release();

    return env.Undefined();
  }

  if (!info[0].IsFunction()) {
    Napi::TypeError::New(env, "Expected function or null.")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Function js_cb = info[0].As<Napi::Function>();

  {
    std::lock_guard<std::mutex> lock(tsfn_mutex);
    rpc_tsfn = Napi::ThreadSafeFunction::New(env, js_cb, "RPC Callback", 0, 1);
  }
#ifdef _WIN32
  // Hand the DLL our CRT's free() with the callback: the response buffer is
  // malloc'd here (MSVC heap) and must be released by the same CRT.
  register_rpc_callback(rpc_trampoline, [](char *p) { free(p); });
#else
  register_rpc_callback(rpc_trampoline);
#endif

  return env.Undefined();
}

// // JS -> register Stream callback
Napi::Value setStreamHandler(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() == 0 || info[0].IsNull() || info[0].IsUndefined()) {
    // Same teardown order and no-wait rationale as setRpcHandler above.
    unregister_stream_callback();
    Napi::ThreadSafeFunction old;
    {
      std::lock_guard<std::mutex> lock(tsfn_mutex);
      old = stream_tsfn;
      stream_tsfn = nullptr;
    }
    if (old)
      old.Release();

    return env.Undefined();
  }

  if (!info[0].IsFunction()) {
    Napi::TypeError::New(env, "Expected function or null.")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Function js_cb = info[0].As<Napi::Function>();

  {
    std::lock_guard<std::mutex> lock(tsfn_mutex);
    stream_tsfn =
        Napi::ThreadSafeFunction::New(env, js_cb, "Stream Callback", 0, 1);
  }

  register_stream_callback(stream_trampoline);

  return env.Undefined();
}

Napi::String CallAlgorithmWrapped(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  // Ensure one argument is provided
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
    return Napi::String::New(env, "");
  }

  std::string input = info[0].As<Napi::String>().Utf8Value();
  std::string result = __callAlgorithm(input);

  return Napi::String::New(env, result);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("setRpcHandler", Napi::Function::New(env, setRpcHandler));
  exports.Set("setStreamHandler", Napi::Function::New(env, setStreamHandler));
  exports.Set(Napi::String::New(env, "callAlgorithm"),
              Napi::Function::New(env, CallAlgorithmWrapped));
  return exports;
}

NODE_API_MODULE(addon, Init)

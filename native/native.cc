#include <condition_variable>
#include <functional>
#include <iostream>
#include <napi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string>

extern "C" {
const char *callAlgorithm(const char *input);
}
std::string __callAlgorithm(const std::string &input) {
  return std::string(callAlgorithm(input.c_str()));
}

using RpcCallback = std::function<char *(const char *)>;
using StreamCallback = std::function<void(const uint8_t *, uint32_t)>;
extern "C" {
#ifdef _WIN32
// primus-zk.dll is MinGW/libstdc++ while this addon is MSVC: only plain C
// types may cross the boundary — the two STLs' std::function layouts are
// incompatible (extern "C" strips the signature, so a mismatch links fine
// and corrupts at runtime). Matches pado-core pado/programs/js_plugin.cpp.
// The captureless lambdas below convert to these pointers implicitly.
void register_rpc_callback(char *(*cb)(const char *));
void register_stream_callback(void (*cb)(const uint8_t *, uint32_t));
#else
void register_rpc_callback(RpcCallback cb);
void register_stream_callback(StreamCallback cb);
#endif
void unregister_rpc_callback();
void unregister_stream_callback();
}

Napi::ThreadSafeFunction rpc_tsfn;
Napi::ThreadSafeFunction stream_tsfn;

// JS -> register RPC callback
Napi::Value setRpcHandler(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() == 0 || info[0].IsNull() || info[0].IsUndefined()) {
    unregister_rpc_callback();
    if (rpc_tsfn) {
      rpc_tsfn.Release();
      rpc_tsfn = nullptr;
    }

    return env.Undefined();
  }

  if (!info[0].IsFunction()) {
    Napi::TypeError::New(env, "Expected function or null.")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Function js_cb = info[0].As<Napi::Function>();

  rpc_tsfn = Napi::ThreadSafeFunction::New(env, js_cb, "RPC Callback", 0, 1);
  register_rpc_callback([](const char *msg) -> char * {
    if (!rpc_tsfn)
      return nullptr;

    std::string _msg(msg);
    struct Context {
      std::mutex m;
      std::condition_variable cv;
      std::string ret;
      bool done = false;
    };

    Context ctx;

    rpc_tsfn.BlockingCall([&ctx, _msg](Napi::Env env, Napi::Function js_cb) {
      Napi::String res =
          js_cb.Call({Napi::String::New(env, _msg)}).As<Napi::String>();

      {
        std::lock_guard<std::mutex> lock(ctx.m);
        ctx.ret = res.Utf8Value();
        ctx.done = true;
      }

      ctx.cv.notify_one();
    });
    std::unique_lock<std::mutex> lock(ctx.m);
    ctx.cv.wait(lock, [&] { return ctx.done; });

    size_t size = ctx.ret.size();
    char *cstr = (char *)malloc(size + 1);
    std::memcpy(cstr, ctx.ret.c_str(), size);
    cstr[size] = '\0';

    return cstr;
  });

  return env.Undefined();
}

// // JS -> register Stream callback
Napi::Value setStreamHandler(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() == 0 || info[0].IsNull() || info[0].IsUndefined()) {
    unregister_stream_callback();
    if (stream_tsfn) {
      stream_tsfn.Release();
      stream_tsfn = nullptr;
    }

    return env.Undefined();
  }

  if (!info[0].IsFunction()) {
    Napi::TypeError::New(env, "Expected function or null.")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Function js_cb = info[0].As<Napi::Function>();

  stream_tsfn =
      Napi::ThreadSafeFunction::New(env, js_cb, "Stream Callback", 0, 1);

  register_stream_callback([](const uint8_t *data, uint32_t len) {
    if (!stream_tsfn)
      return;

    std::vector<uint8_t> _data(data, data + len);
    stream_tsfn.BlockingCall(
        [_data = std::move(_data)](Napi::Env env, Napi::Function js_cb) {
          Napi::Buffer<uint8_t> buf =
              Napi::Buffer<uint8_t>::Copy(env, _data.data(), _data.size());
          js_cb.Call({buf});
        });
  });

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

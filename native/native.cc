#include <iostream>
#include <napi.h>
#include <stdio.h>
#include <string>

extern "C" {
const char *callAlgorithm(const char *input);
}
std::string __callAlgorithm(const std::string &input) {
  return std::string(callAlgorithm(input.c_str()));
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
  exports.Set(Napi::String::New(env, "callAlgorithm"),
              Napi::Function::New(env, CallAlgorithmWrapped));
  return exports;
}

NODE_API_MODULE(addon, Init)

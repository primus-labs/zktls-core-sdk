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

// Function pointer type
typedef std::string (*TestFunction)(const std::string &);

// Node-API wrapper for the `test` function
Napi::String CallAlgorithmWrapped(const Napi::CallbackInfo &info) {
  printf("CallAlgorithmWrapped\n");
  Napi::Env env = info.Env();

  // Ensure one argument is provided
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
    return Napi::String::New(env, "");
  }

  // Convert the JavaScript string to a C++ string
  std::string input = info[0].As<Napi::String>().Utf8Value();

  // Call the dynamic library function
  std::string result = __callAlgorithm(input);

  // Return the result as a JavaScript string
  return Napi::String::New(env, result);
}

// Initialize the module
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  printf("Init\n");

    exports.Set(Napi::String::New(env, "callAlgorithm"),
                Napi::Function::New(env, CallAlgorithmWrapped));
  return exports;
}

NODE_API_MODULE(addon, Init)

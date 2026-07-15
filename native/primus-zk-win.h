/*
 * primus-zk-win.h — the Windows C ABI of primus-zk.dll.
 *
 * The DLL is built with MinGW-w64 (libstdc++) while consumers (e.g. the
 * zktls-core-sdk Node addon) compile with MSVC. Nothing but plain C types may
 * cross that boundary, and heap ownership must never change CRT sides:
 *
 *   - callbacks are plain C function pointers (std::function layouts are
 *     incompatible between the two STLs; extern "C" strips the signature, so
 *     a mismatch links fine and corrupts at runtime);
 *   - the rpc callback's returned buffer is allocated by the CONSUMER's CRT,
 *     so registration also takes the consumer's deallocator and the DLL
 *     returns the buffer through it (a cross-CRT free() corrupts the heap);
 *   - strings returned by callAlgorithm are owned by the DLL and remain
 *     valid until the next callAlgorithm call; consumers must copy, never
 *     free.
 *
 * This header is installed next to primus-zk.def (install/windows/lib) and is
 * the single source of truth for these signatures: the DLL implementation
 * (js_plugin.cpp / client_api.cpp) and every consumer must include it rather
 * than re-declaring the functions. Non-Windows builds do not use this header.
 *
 * PRIMUS_ZK_API: empty for consumers (link via the import library); the DLL
 * build defines it as __declspec(dllexport) before inclusion.
 */
#ifndef PRIMUS_ZK_WIN_H__
#define PRIMUS_ZK_WIN_H__

#include <stdint.h>

#ifndef PRIMUS_ZK_API
#define PRIMUS_ZK_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* Handles one rpc request; returns a NUL-terminated response allocated by the
 * consumer's CRT (or NULL). The DLL releases it via the primus_zk_rpc_free
 * registered together with the callback. */
typedef char* (*primus_zk_rpc_cb)(const char* request);

/* Releases a buffer previously returned by the primus_zk_rpc_cb registered
 * alongside it; must free with the same CRT that allocated it. */
typedef void (*primus_zk_rpc_free)(char* response);

/* Receives streamed data; `data` is only valid for the duration of the call —
 * copy it before returning. No ownership transfer. */
typedef void (*primus_zk_stream_cb)(const uint8_t* data, uint32_t len);

/* Runs an algorithm request (JSON in/out). The returned string is owned by
 * the DLL and is invalidated by the next call — copy, never free. */
PRIMUS_ZK_API const char* callAlgorithm(const char* json_params);

PRIMUS_ZK_API void register_rpc_callback(primus_zk_rpc_cb cb,
                                         primus_zk_rpc_free free_result);
PRIMUS_ZK_API void register_stream_callback(primus_zk_stream_cb cb);
PRIMUS_ZK_API void unregister_rpc_callback(void);
PRIMUS_ZK_API void unregister_stream_callback(void);

#ifdef __cplusplus
}
#endif

#endif /* PRIMUS_ZK_WIN_H__ */

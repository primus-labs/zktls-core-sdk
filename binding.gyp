{
    "targets": [
        {
            "target_name": "primus-zktls-native",
            "sources": ["native/native.cc"],
            "cflags": ["-std=c++17", "-fexceptions"],
            "cflags_cc": ["-std=c++17", "-fexceptions"],
            "include_dirs": ["<!(node -p \"require('node-addon-api').include_dir\")"],
            "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
            "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
            "conditions": [
                [
                    "OS=='mac'",
                    {
                        "libraries": ["-L<(module_root_dir)/native", "-lprimus-zk"],
                        "link_settings": {
                            "libraries": [
                                "-Wl,-rpath,@loader_path",
                                "-Wl,-rpath,<(module_root_dir)/native",
                            ]
                        },
                    },
                ],
                [
                    "OS=='linux'",
                    {
                        "libraries": ["-L<(module_root_dir)/native", "-lprimus-zk"],
                        "link_settings": {
                            "libraries": [
                                "-Wl,-rpath,'$$ORIGIN'",
                                "-Wl,-rpath,<(module_root_dir)/native",
                            ]
                        },
                    },
                ],
            ],
        }
    ]
}

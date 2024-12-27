const { getAttestationConfig, getAttestation, getAttestationResult } = require("./primus_zk.js");


async function test_tiktokv() {
  // step 0: get the default config
  var attParams = getAttestationConfig();

  // (optional) set padoUrl,proxyUrl,basePort if neccessary
  // (optional) set appParameters if neccessary
  // (optional) set cipher if neccessary


  // (MUST) set host,requests,responses
  attParams.host = "mcs-sg.tiktokv.com";
  const request = {
    // should set
    "name": "tiktokv-list",
    // should set
    "url": "https://mcs-sg.tiktokv.com/v1/list",
    // optional, default is GET
    "method": "POST",
    // optional, should set if the method is POST and the body is set
    "headers": {
      "sec-ch-ua-platform": "\"macOS\"",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
      "Content-Type": "application/json; charset=UTF-8",
      "sec-ch-ua-mobile": "?0",
      "Accept": "*/*",
      "Origin": "https://www.tiktok.com",
      "Sec-Fetch-Site": "cross-site",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
      "Referer": "https://www.tiktok.com/",
      "Accept-Encoding": "identity",
      "Accept-Language": "en-GB-oxendict,en;q=0.9,zh-CN;q=0.8,zh;q=0.7"
    },
    // optional, can be string, array, object
    "body": [
      {
        "events": [
          {
            "event": "__bav_page",
            "params": "{\"is_html\":1,\"url\":\"https://www.tiktok.com/\",\"referrer\":\"\",\"page_key\":\"https://www.tiktok.com/\",\"refer_page_key\":\"\",\"page_title\":\"TikTok - Make Your Day\",\"page_manual_key\":\"\",\"refer_page_manual_key\":\"\",\"refer_page_title\":\"TikTok - Make Your Day\",\"page_path\":\"/\",\"page_host\":\"www.tiktok.com\",\"is_first_time\":\"false\",\"is_back\":0,\"page_total_width\":1440,\"page_total_height\":733,\"scroll_width\":1440,\"scroll_height\":733,\"page_start_ms\":1735028371701,\"event_index\":1735028566822}",
            "local_time_ms": 1735028372966,
            "is_bav": 1,
            "session_id": "ba4733f4-9837-4d8c-84d3-468edf30b602"
          },
          {
            "event": "__bav_page_statistics",
            "params": "{\"is_html\":1,\"page_key\":\"https://www.tiktok.com/\",\"refer_page_key\":\"\",\"page_title\":\"TikTok - Make Your Day\",\"page_manual_key\":\"\",\"refer_page_manual_key\":\"\",\"page_init_cost_ms\":0,\"page_start_ms\":1735028371701,\"event_index\":1735028566821}",
            "local_time_ms": 1735028372959,
            "is_bav": 1,
            "session_id": "ba4733f4-9837-4d8c-84d3-468edf30b602"
          },
          {
            "event": "arm_browser_render",
            "params": "{\"time_from_origin\":1256,\"timer_from_ttfb\":282,\"page_name\":\"homepage_hot\",\"last_event\":\"\",\"duration\":1257,\"device\":\"pc\",\"userAgent\":\"Mozilla / 5.0(Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/ 537.36(KHTML, like Gecko) Chrome / 131.0.0.0 Safari / 537.36\",\"event_index\":1735028566820}",
            "local_time_ms": 1735028372957,
            "is_bav": 1,
            "session_id": "ba4733f4-9837-4d8c-84d3-468edf30b602"
          }
        ],
        "user": {
          "user_unique_id": "7447440952928912914",
          "user_type": 12,
          "user_id": "7316364920953930757",
          "user_is_login": true,
          "device_id": "7447440952928912914"
        },
        "header": {
          "app_id": 1988,
          "os_name": "mac",
          "os_version": "10_15_7",
          "device_model": "Macintosh",
          "language": "en-GB-oxendict",
          "region": "JP",
          "platform": "web",
          "sdk_version": "5.3.3_oversea",
          "sdk_lib": "js",
          "timezone": 8,
          "tz_offset": -28800,
          "resolution": "1440x900",
          "browser": "Chrome",
          "browser_version": "131.0.0.0",
          "referrer": "",
          "referrer_host": "",
          "width": 1440,
          "height": 900,
          "screen_width": 1440,
          "screen_height": 900,
          "tracer_data": "{\"$utm_from_url\":1}",
          "custom": "{\"session_id\":\"74474409529289129141735028372955\",\"webid_created_time\":\"1733992482\",\"app_language\":\"en\",\"page_name\":\"homepage_hot\",\"device\":\"pc\",\"launch_mode\":\"direct\",\"device_memory\":8,\"traffic_type\":\"no_referrer\",\"source\":\"\",\"referer_url\":\"direct\",\"browserName\":\"google\",\"hevcSupported\":1,\"cpu_core\":8}"
        },
        "local_time": 1735028372,
        "verbose": 1
      }
    ]
  };
  attParams.requests.push(request);

  const response = {
    "conditions": {
      "type": "CONDITION_EXPANSION",
      "op": "&",
      "subconditions": [
        {
          "field": "$.sc",
          "op": "REVEAL_STRING",
          "reveal_id": "sc",
          "type": "FIELD_REVEAL"
        }
      ]
    }
  };
  attParams.responses.push(response);

  // step z: call getAttestation
  await getAttestation(attParams);

  // get the result
  const result = await getAttestationResult(60 * 1000);
  console.log("result", result);

  process.exit(0); // exit
}

test_tiktokv();


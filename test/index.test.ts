import { PrimusCoreTLS} from '../src/index';

// describe('listData function', () => {
//     // jest.setTimeout(50000);
    
//     const appId = "0x899dd126268e3010beaa1ac141a2a0aa98deba09";
//     const appSecret = "0x7da5d1cd2fdd494aa1176031151a6202734e30ddb14fd01dc3376616408ee0a7";
//     it('init', async () => {
//         const zkTLS = new PrimusCoreTLS();
//         const result = await zkTLS.init(appId, appSecret);
//         console.log("-------------test result=", result);
//     });
  
// });


describe('test', () => {
    jest.setTimeout(50000);
    // production
    const appId = "0xe319e567f70e2b2a153cb6ceaa73893648cde180";
    const appSecret = "0x4348563b2178adc171d851bcc27054d7879e07a41263ccfaa3b00d63d056559a";
    // test
    // const appId = "0x899dd126268e3010beaa1ac141a2a0aa98deba09";
    // const appSecret = "0x7da5d1cd2fdd494aa1176031151a6202734e30ddb14fd01dc3376616408ee0a7";
    it('generate', async () => {
        console.log('--------------process.env', process.env.NODE_ENV)
        try {
            // 1.
            const zkTLS = new PrimusCoreTLS();
            const result = await zkTLS.init(appId, appSecret);
            console.log("-------------init result=", result);
            
            // 2.
            // let request = {
            //     url: 'https://www.binance.com/bapi/accounts/v2/public/account/ip/country-city-short',
            //     method: 'GET',
            // }
            // const responseResolves = [{
            //     keyName: 'code',
            //     parsePath: '$.code',
            //     parseType: 'string'
            // }]
            // let request = {
            //     url: "https://api.x.com/1.1/account/settings.json?include_ext_sharing_audiospaces_listening_data_with_followers=true&include_mention_filter=true&include_nsfw_user_flag=true&include_nsfw_admin_flag=true&include_ranked_timeline=true&include_alt_text_compose=true&ext=ssoConnections&include_country_code=true&include_ext_dm_nsfw_media_filter=true",
            //     method: "GET",
            //     header: {
            //         "sec-ch-ua-platform": "\"macOS\"",
            //         "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
            //         "x-csrf-token": "26483dc046b7270d8b0f64e6b568506d471f1d43eecd65b058a9e9d3a54a726d73c600c8edfaec1cadaf63b3e00213cec37eee3ead0c490aea3ad2b1fbb63cfbe22e166d399e35a0932d00ae08cc5f37",
            //         "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
            //         "x-twitter-client-language": "en",
            //         "sec-ch-ua-mobile": "?0",
            //         "x-twitter-active-user": "yes",
            //         "x-client-transaction-id": "XeJoIFCh0c/PPXrZOqoWIBxrSQy+6A+xls5TSeuBCo0ZOltwrwGxJYsd0K+mmMYjTVBqcV7DStZYaCnVp5g/o7qL7VC8Xg",
            //         "x-twitter-auth-type": "OAuth2Session",
            //         "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            //         "Accept": "*/*",
            //         "Origin": "https://x.com",
            //         "Sec-Fetch-Site": "same-site",
            //         "Sec-Fetch-Mode": "cors",
            //         "Sec-Fetch-Dest": "empty",
            //         "Referer": "https://x.com/",
            //         "Accept-Encoding": "identity",
            //         "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
            //         "Cookie": "night_mode=2; kdt=sE6MiwmuvnVP8sp2yGHD3gwUefkh7ai3ESDSaHC0; personalization_id=\"v1_BX42MMJnn/3vCCKEFI1SEQ==\"; dnt=1; guest_id=v1%3A173441445333956615; auth_token=a5c4f761ffc9304a31b5f186b0447f2764746cb5; twid=u%3D1645345914561892352; guest_id_ads=v1%3A173441445333956615; guest_id_marketing=v1%3A173441445333956615; ct0=26483dc046b7270d8b0f64e6b568506d471f1d43eecd65b058a9e9d3a54a726d73c600c8edfaec1cadaf63b3e00213cec37eee3ead0c490aea3ad2b1fbb63cfbe22e166d399e35a0932d00ae08cc5f37"
            //     },
            //     body: {}
            // }
            // const responseResolves = [{
            //     keyName: 'screen_name',
            //     parsePath: '$.screen_name',
            //     parseType: 'string'
            // }]
            
            let request ={
                url: "https://mcs-sg.tiktokv.com/v1/list",
                method: "POST",
                header: {
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
                    "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8"
                },
                body: [
                    {
                        "events": [
                            {
                                "event": "__bav_page",
                                "params": "{\"is_html\":1,\"url\":\"https://www.tiktok.com/\",\"referrer\":\"\",\"page_key\":\"https://www.tiktok.com/\",\"refer_page_key\":\"\",\"page_title\":\"TikTok - Make Your Day\",\"page_manual_key\":\"\",\"refer_page_manual_key\":\"\",\"refer_page_title\":\"TikTok - Make Your Day\",\"page_path\":\"/\",\"page_host\":\"www.tiktok.com\",\"is_first_time\":\"false\",\"is_back\":0,\"page_total_width\":1512,\"page_total_height\":771,\"scroll_width\":1512,\"scroll_height\":771,\"page_start_ms\":1736157993395,\"event_index\":1736158419929}",
                                "local_time_ms": 1736157997985,
                                "is_bav": 1,
                                "session_id": "bc01fc24-1e44-4b88-855e-dfafd5aa17da"
                            },
                            {
                                "event": "__bav_page_statistics",
                                "params": "{\"is_html\":1,\"page_key\":\"https://www.tiktok.com/\",\"refer_page_key\":\"\",\"page_title\":\"TikTok - Make Your Day\",\"page_manual_key\":\"\",\"refer_page_manual_key\":\"\",\"page_init_cost_ms\":0,\"page_start_ms\":1736157993395,\"event_index\":1736158419928}",
                                "local_time_ms": 1736157997947,
                                "is_bav": 1,
                                "session_id": "bc01fc24-1e44-4b88-855e-dfafd5aa17da"
                            },
                            {
                                "event": "arm_browser_render",
                                "params": "{\"time_from_origin\":4535,\"timer_from_ttfb\":3672,\"page_name\":\"homepage_hot\",\"last_event\":\"\",\"duration\":4536,\"device\":\"pc\",\"userAgent\":\"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36\",\"event_index\":1736158419927}",
                                "local_time_ms": 1736157997931,
                                "is_bav": 1,
                                "session_id": "bc01fc24-1e44-4b88-855e-dfafd5aa17da"
                            }
                        ],
                        "user": {
                            "user_unique_id": "7425873819514373640",
                            "user_type": 12,
                            "user_id": "7316364221107700754",
                            "user_is_login": true,
                            "device_id": "7425873819514373640"
                        },
                        "header": {
                            "app_id": 1988,
                            "os_name": "mac",
                            "os_version": "10_15_7",
                            "device_model": "Macintosh",
                            "language": "en",
                            "region": "SG",
                            "platform": "web",
                            "sdk_version": "5.3.3_oversea",
                            "sdk_lib": "js",
                            "timezone": 8,
                            "tz_offset": -28800,
                            "resolution": "1512x982",
                            "browser": "Chrome",
                            "browser_version": "131.0.0.0",
                            "referrer": "",
                            "referrer_host": "",
                            "width": 1512,
                            "height": 982,
                            "screen_width": 1512,
                            "screen_height": 982,
                            "tracer_data": "{\"$utm_from_url\":1}",
                            "custom": "{\"session_id\":\"74258738195143736401736157997914\",\"webid_created_time\":\"1728970991\",\"app_language\":\"en\",\"page_name\":\"homepage_hot\",\"device\":\"pc\",\"launch_mode\":\"direct\",\"device_memory\":8,\"traffic_type\":\"no_referrer\",\"source\":\"\",\"referer_url\":\"direct\",\"browserName\":\"google\",\"hevcSupported\":1,\"cpu_core\":8}"
                        },
                        "local_time": 1736157997,
                        "verbose": 1
                    }
                ]
            }
               const responseResolves = [{
                keyName: 'sc',
                parsePath: '$.sc',
                parseType: 'string'
            }]
            const generateRequestParamsRes = zkTLS.generateRequestParams(request, responseResolves)
            // console.log("-------------generateRequestParams result=", generateRequestParamsRes);
            
            // 3.
            // const startAttestationRes =
            // const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            // await delay(800);
            const attestation = await zkTLS.startAttestation(generateRequestParamsRes);
            console.log("attestation=", attestation);
            console.log("attestation.data=", attestation.data);
            const verifyAttestationRes = zkTLS.verifyAttestation(attestation)
            console.log("verifyAttestationRes=", verifyAttestationRes);
        } catch (e) {
            console.log('-----------generate error =',  e);
        }
        
    });
  
});

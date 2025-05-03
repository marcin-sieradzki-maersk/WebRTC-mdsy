let c2c_serverConfig = {
    domain: 'audiocodes.com',                 // SBC domain name, used to build SIP headers From/To
    addresses: ["wss://azure-emea-2.maersk.net:10081"],  // AudioCodes SBC secure web socket address (can be multiple)
    // addresses: '_take_value_from_url_', // Special case. Get SBC address from URL 'server' parameter.

    iceServers: [],                        // Optional STUN or TURN servers.
    /* Optional TURN server 
       iceServers: [
           { urls: 'turn:example.turn.com',
             username: 'xxx',
             credential: 'yyy',
           }
        ],
        iceTransportPolicyRelay: false      // If true will be used only 'relay' ice candidate
    */

    /*
     // Optional websocket logger server (instead console.log)
     logger: 'example.com/wslog'
    */
};

let c2c_config = {
    // Call
    call: '+15164614104', // Call to this user name (or phone number). Special value: '_take_value_from_url_' to set the value from URL 'call' parameter
    caller: 'Anonymous', // Caller user name (One word according SIP RFC 3261). 
    callerDN: 'Anonymous', // Caller display name (words sequence).
    type: 'audio',   // Call type: 'audio', 'video' or 'user_control'
    videoCheckboxDefault: false, // For 'user_control' call, default value of video checkbox.
    //videoSize: { width: '400px', height: '300px' }, // video size (a little smaller)
    videoSize: { width: '480px', height: '360px' }, // video size (a little bigger)
    callAutoStart: 'no',  // Start call automatically after page loading. Values: 'yes' (start if autoplay policy enabled) 'yes force' (start always), 'no' (don't start call automatically)                                      
    messageDisplayTime: 5, // A message will be displayed during this time (seconds).
    restoreCallMaxDelay: 20, // After page reloading, call can be restored within the time interval (seconds).
    allowCallWithoutMicrophone: true, // Allow call even without microphone, if microphone is missed send sound: "absenceMicrophoneSound" 
    networkPriority: undefined, // Sending RTP DSCP network priority: undefined (don't change) or 'high', 'medium', 'low', 'very-low'. Supported only in Chrome.
    urlToken: false,             // Optional. Experimental. Take security token from URI and send it as special SIP header.

    // Optional test call to check line quality.
    testCallEnabled: true,    // If test call enabled (show test call GUI)
    testCallSBCScore: true,   // Test call voice quality score calculated by SBC API (true) or browser API (false).
    testCallUser: '5555',     // Call to this user for test call (It's special test call user in SBC that auto answer and play sound prompt)
    testCallAutoStart: false,  // Start test call automatically after page loading when auto play policy enable play sound or when for test call used microphone.
    testCallUseMicrophone: false, // Send microphone sound (true) or generated tone/download sound (false).
    testCallVolume: 0.0,      // 1.0 .. 0.0. Hear or not test call audio prompt received from SBC
    testCallMinDuration: 10,  // For SBC API request URL "duration" value (converted to ms), for browser API minimum test duration value.
    testCallMaxDuration: 20,  // For browser API only. Call will terminated after testCallMinDuration if received remote-inbound-rtp and always after testCallMaxDuration.
    testCallQualityText: {    // For SBC API only. mapping SBC "color" voice quality score with corresponding text message.
        'green': 'Good', 'yellow': 'Fair', 'red': 'Low', 'gray': 'N/A'
    },

    /* 
     * Optional. To select microphone, camera and speaker.
     *
     * Microphone and camera selection works in all browsers.
     *
     * Speaker selection works only in Chrome (with some exceptions): 
     * Works in Windows Chrome.
     * Don't work in iOS Chrome. (It's iOS design limitation)
     * Does not always work in Android Chrome (Probably it depends of Android version and used headset type)
     */
    selectDevicesEnabled: true,

    // Optional. DTMF keypad. Sending DTMF during call.
    dtmfKeypadEnabled:  true,    

    // Optional. Show video from local camera. 
    selfVideoEnabled: true,
    selfVideoCheckboxDefault: false,
    
    // Websocket keep alive.
    pingInterval: 10,          // Keep alive ping interval,  0 value means don't send pings. (seconds)
    pongTimeout: true,         // Close and reopen websocket when pong timeout detected
    timerThrottlingBestEffort: true, // Action if timer throttling detected (for Chrome increase ping interval)
    pongReport: 60,       // if 0 not print, otherwise each N pongs print min and max pong delay 
    pongDist: false,      // Print to console log also pong delay distribution.    

    // SDK modes. 
    modes: {
        ice_timeout_fix: 2000,             // ICE gathering timeout (milliseconds)
        chrome_rtp_timeout_fix: 13,        // Workaround of https://bugs.chromium.org/p/chromium/issues/detail?id=982793
    }
};

let c2c_soundConfig = {
    generateTones: {
        ringingTone: [{ f: 400, t: 1.5 }, { t: 3.5 }],
        busyTone: [{ f: 400, t: 0.5 }, { t: 0.5 }],
        disconnectTone: [{ f: 400, t: 0.5 }, { t: 0.5 }],
        sirenTone: [{ f: 400, t: 1.0 }, { f: 300, t: 0.5 }]
    },

    downloadSounds: [
        //'flowing_stream'
    ],

    play: {
        outgoingCallProgress: { name: 'ringingTone', loop: true, volume: 0.2 },
        busy: { name: 'busyTone', volume: 0.2, repeat: 4 },
        disconnect: { name: 'disconnectTone', volume: 0.2, repeat: 3 },
        testCallSound: { name: 'sirenTone', loop: true, volume: 1.0 },
        noMicrophoneSound: { name: 'sirenTone', loop: true, volume: 0.1 },
        dtmf: { volume: 0.15 }
    },
};
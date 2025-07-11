'use strict';

/*
   Click to Call Widget for SDK 1.19.0

   Call a specific user set in configuration file,
          other option - set user as URL parameter (with possible DTMF keys sequence)
   
   Call type: 'audio' audio only call
              'video' video call
              'user_control' audio or video call (selected by checkbox),
                             camera can be switched on/off during call,
                             allowed re-INVITE with added video.

   Optional voice test call to check connection quality with SBC.
   The widget can be loaded from HTTPS server (or from local file)
   
   Igor Kolosov AudioCodes Ltd 2023
 */
const c2c_userAgent = 'AudioCodes Click-to-Call';
const c2c_sbcDisconnectCounterMax = 5;
const c2c_sbcDisconnectDelay = 60;   // After call termination keep SBC connection the time interval (seconds)

let c2c_phone = new AudioCodesUA(); // phone API
let c2c_ac_log = console.log;       // phone logger
let c2c_hasMicrophone = true;
let c2c_hasCamera = false;
let c2c_audioPlayer = new AudioPlayer2();
let c2c_activeCall = null; // not null, if exists active call
let c2c_restoreCall = null;
let c2c_sbcDisconnectCounter = 0;
let c2c_sbcDisconnectTimer = null;
let c2c_messageId = 0;
let c2c_streamDest = null;      // Audio player stream destination (to play recorded sound during test call)
let c2c_usedTurnServer = false; // If TURN server set in configuration ?
let c2c_isRegularCall = true;   // Regular or test call ?
let c2c_isWsConnected = false;  // Is websocket connected to SBC ? 
let c2c_isStartCall = false;    // start call after SBC connection.
let c2c_dtmfSequence = null;    // send DTMF sequence after connection.
let c2c_dtmfDelay = 2000;       // delay (milliseconds) before DTMF sending.
let c2c_callButtonHandler = function () { };
let c2c_testButtonHandler = function () { };
let c2c_callButtonTitle = null;
let c2c_x_header = null;        // optional x header added to INVITE.
let c2c_token = null;
let c2c_devices = null;         // optional select devices feature, not for all OS/browsers.
let c2c_remoteVideoDeviceId = undefined; // last associated deviceId
let c2c_isSelfVideo = false;
let c2c_callTimer = null;       // interval timer for updating call duration display
let c2c_actionsSlot = null;     // reference to the actions slot element
let c2c_actionsParent = null;   // reference to the parent of the actions slot

// HTML element references

// Optional connection speed. Used if testCallEnabled in config.js
let c2c_connectionSpeedDiv = null;
// Test call quality. Used if testCallEnabled in config.js
let c2c_testCallQualityDiv = null;

// Block of call buttons.
let c2c_widgetDiv = null;

// Select devices button. Used if selectDevicesEnabled in config.js
let c2c_selectDevicesButton = null;

// Keypad. Used if dtmfKeypadEnabled in config.js
let c2c_keypadButton = null;
let c2c_keypadDiv = null;
let c2c_keypadInput = null;
let c2c_keypadClearButton = null;

// Mute button for audio control during calls
let c2c_muteButton = null;

// Hold button for call hold/resume during calls
let c2c_holdButton = null;

// Callback phone number input
let c2c_callbackPhoneInput = null;

// Login elements
let c2c_usernameInput = null;
let c2c_passwordInput = null;
let c2c_loginButton = null;
let c2c_loginSection = null;
let c2c_mainApplication = null;

// Test call button. Used if testCallEnabled in config.js
let c2c_testButton = null;

// Call button - the same button used as call and hangup button.
let c2c_callButton = null;

// If call type is 'user_control' before call show video checkbox
let c2c_videoSpan = null;
let c2c_videoCheckbox = null;

// If call type is 'user_control' during call show camera button
let c2c_cameraButton = null;
let c2c_cameraLineSvg = null;

// Select devices div 
let c2c_selectDevicesDiv = null;

// Status line.
let c2c_status_line = null;

// Video element 
let c2c_localVideo = null;
let c2c_remoteVideo = null;

// Optional show yourself
let c2c_selfVideoSpan = null;
let c2c_selfVideoChk = null;

// Set logger: console or websocket.
function c2c_init() {
    let logger = c2c_getStrUrlParameter('logger');
    if (!logger)
        logger = c2c_serverConfig.logger;

    if (!logger) {
        c2c_setConsoleLoggers();
        c2c_startPhone();
    } else {
        c2c_setWebsocketLoggers(logger)
            .catch((e) => {
                c2c_setConsoleLoggers();
                c2c_ac_log('Cannot connect to logger server', e);
            })
            .finally(() => {
                c2c_startPhone();
            })
    }
}

// Start cick to call phone.
async function c2c_startPhone() {
    c2c_ac_log(`------ Date: ${new Date().toDateString()} -------`);
    c2c_ac_log(c2c_userAgent);
    c2c_ac_log(`SDK: ${c2c_phone.version()}`);
    c2c_ac_log(`SIP: ${JsSIP.C.USER_AGENT}`);
    c2c_ac_log(`Browser: ${c2c_phone.getBrowserName()}  Internal name: ${c2c_phone.getBrowser()}|${c2c_phone.getOS()}`);

    c2c_phone.setUserAgent(`${c2c_userAgent} ${c2c_phone.version()} ${c2c_phone.getBrowserName()}`);

    // The device selection feature is optional
    if (c2c_config.selectDevicesEnabled) {
        c2c_devices = new SelectDevices();

        c2c_devices.setDevices(true,
            [{ name: 'microphone', kind: 'audioinput' },
            { name: 'camera', kind: 'videoinput' },
            { name: 'speaker', kind: 'audiooutput' }]);

        // click-to-call does not use local storage, but uses session storage
        // to restore selected devices after page reload.
        let selectedDevices = sessionStorage.getItem('c2c_selectedDevices');
        if (selectedDevices !== null) {
            c2c_devices.load(JSON.parse(selectedDevices));
        }

        await c2c_devices.enumerate(true);
        
        // Set default selection to index 1 for all devices (if available)
        for (let name of c2c_devices.names) {
            let device = c2c_devices.getDevice(name);
            if (device.list.length > 1) {
                c2c_devices.setSelectedIndex(name, 1);
                c2c_ac_log(`Set default device selection for ${name} to index 1: "${device.list[1].label}"`);
            }
        }
    }

    // Optional url parameters: 'call', 'dtmf', 'delay', 'server', 'domain', 'logger', 'token' E.g. ?call=user1&delay=2000&dtmf=1234%23&server=sbc.audiocodes.com
    let call = c2c_getStrUrlParameter('call');
    if (call) {
        if (c2c_config.call === '_take_value_from_url_') {
            c2c_config.call = c2c_stringDropCharacters(call, ' -');
        } else {
            c2c_ac_log(`Error: URL parameter "call" is ignored. To enable set configuration "call: '_take_value_from_url_'"`);
        }
    }

    let domain = c2c_getStrUrlParameter('domain');
    if (domain) {
        if (c2c_serverConfig.domain === '_take_value_from_url_') {
            c2c_serverConfig.domain = domain;
        } else {
            c2c_ac_log(`Error: URL parameter "domain" is ignored. To enable set configuration "domain: '_take_value_from_url_'"`);
        }
    }

    let server = c2c_getStrUrlParameter('server');
    if (server) {
        if (c2c_serverConfig.addresses === '_take_value_from_url_') {
            c2c_serverConfig.addresses = [`wss://${server}`];
        } else {
            c2c_ac_log(`Error: URL parameter "server" is ignored. To enable set configuration "addresses: '_take_value_from_url_'"`);
        }
    }

    // Get optional secure token from URL if configured.
    let token = c2c_getStrUrlParameter('token');
    if (token) {
        if (c2c_config.urlToken) {
            c2c_token = token;
        } else {
            c2c_ac_log(`Error: URL parameter "token" is ignored. To enable set configuration "urlToken: true"`);
        }
    }

    let dtmf = c2c_getStrUrlParameter('dtmf');
    if (dtmf) {
        c2c_dtmfSequence = c2c_stringDropCharacters(dtmf, ' -');
    }
    c2c_dtmfDelay = c2c_getIntUrlParameter('delay', c2c_dtmfDelay);
    if (call || dtmf) {
        c2c_ac_log(`URL parameters: call=${call} dtmf=${dtmf} delay=${c2c_dtmfDelay}`
            + `\nAfter filtering: call=${c2c_config.call}  dtmf=${c2c_dtmfSequence}`);
    }

    // In iOS and macOS Safari and iOS Chrome getStats() missed "remote-inbound-rtp".
    let browser = c2c_phone.getBrowser();
    let os = c2c_phone.getOS();
    if (c2c_config.testCallEnabled && !c2c_config.testCallSBCScore && (browser === 'safari' || os === 'ios')) {
        c2c_ac_log('Disable test call for iMac/iOS Safari browser, because getStats() implementation missed remote-inbound-rtp report');
        c2c_config.testCallEnabled = false;
    }

    // Get HTML element references.
    // Check presence of mandatory elements.
    if (!c2c_getHTMLPageReferences()) {
        return; // Missed mandatory HTML element, please fix used HTML.
    }

    // Set buttons handlers
    c2c_callButton.onclick = function () { c2c_buttonHandler('call button', c2c_callButtonHandler); }
    
    // Set handlers for both start and end call buttons
    let startCallBtn = document.getElementById('start-call-btn');
    let endCallBtn = document.getElementById('c2c_call_btn');
    if (startCallBtn && startCallBtn !== c2c_callButton) {
        startCallBtn.onclick = function () { c2c_buttonHandler('start call button', c2c_callButtonHandler); }
    }
    if (endCallBtn && endCallBtn !== c2c_callButton) {
        endCallBtn.onclick = function () { c2c_buttonHandler('end call button', c2c_callButtonHandler); }
    }
    
    
    if (c2c_selectDevicesButton) c2c_selectDevicesButton.onclick = function () { c2c_buttonHandler('select devices button', c2c_selectDevices); }
    if (c2c_keypadButton) c2c_keypadButton.onclick = function () { c2c_buttonHandler('keypad show/hide button', c2c_keypadToggle); }
    if (c2c_keypadClearButton) c2c_keypadClearButton.onclick = function () { c2c_buttonHandler('keypad clear button', c2c_keypadClear); }
    if (c2c_loginButton) c2c_loginButton.onclick = function () { c2c_buttonHandler('login button', c2c_handleLogin); }
    
    // Add Enter key support for login inputs
    if (c2c_usernameInput) {
        c2c_usernameInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                c2c_buttonHandler('login button', c2c_handleLogin);
            }
        });
    }
    if (c2c_passwordInput) {
        c2c_passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                c2c_buttonHandler('login button', c2c_handleLogin);
            }
        });
    }
    if (c2c_muteButton) c2c_muteButton.onclick = function () { c2c_buttonHandler('mute/unmute button', c2c_muteToggle); }
    if (c2c_holdButton) c2c_holdButton.onclick = function () { c2c_buttonHandler('hold/resume button', c2c_holdToggle); }
    if (c2c_testButton) c2c_testButton.onclick = function () { c2c_buttonHandler('test button', c2c_testButtonHandler); }
    if (c2c_cameraButton) c2c_cameraButton.onclick = function () { c2c_buttonHandler('webcam on/off button', c2c_cameraToggle); }
    if (c2c_selfVideoChk) c2c_selfVideoChk.onclick = function () { c2c_buttonHandler('show local video', c2c_selfVideoToggle); }
    // Show test call GUI elements.
    if (c2c_config.testCallEnabled) {
        c2c_testButtonHandler = function () { c2c_call(false); }

        // Get connection information (only for Chrome)
        if (c2c_connectionSpeedDiv && navigator.connection) {
            try {
                let nc = navigator.connection;
                if (nc.downlink) {
                    let downlink = nc.downlink;
                    c2c_connectionSpeedDiv.innerHTML = 'Connection speed: <span style="font-weight:bold">' + downlink + '</span> Mbps';
                } else {
                    throw 'nc.downlink is undefined';
                }
            } catch (e) {
                c2c_ac_log('Cannot get connection information', e);
            }
        }
    }

    // Check WebRTC support. If loaded from unsecure context (HTTP site) the WebRTC API is hidden. 
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        c2c_info('No WebRTC');
        c2c_gui_phoneDisabled('WebRTC API is not supported in this browser !');
        return;
    }

    // Check presence of microphone, speaker, web camera.
    try {
        c2c_hasCamera = await c2c_phone.checkAvailableDevices();
        c2c_ac_log(`Camera is ${c2c_hasCamera ? 'present' : 'missing'}`);
    } catch (e) {
        if (c2c_config.allowCallWithoutMicrophone) {
            c2c_ac_log('Microphone is missed. Used "allowCallWithoutMicrophone" mode');
            c2c_hasMicrophone = false;
        } else {
            c2c_info('No microphone or speaker !'); // Please connect headset and reload page.
            c2c_gui_phoneDisabled('No microphone or speaker !');
            return;
        }
    }

    if (location.protocol !== 'https:' && location.protocol !== 'file:') {
        c2c_ac_log('Warning: for the URL used "' + location.protocol + '" protocol');
    }

    // simple symmetric letter substitution cipher
    const rot13 = s => s.replace(/[a-z]/gi, c => String.fromCharCode(c.charCodeAt() + 13 - 26 * /[n-z]/i.test(c)));

    // Check if used TURN
    for (let server of c2c_serverConfig.iceServers) {
        if (typeof server === 'string')
            continue;
        let url = Array.isArray(server.urls) ? server.urls[0] : server.urls;
        if (url.startsWith('turn:')) {
            c2c_usedTurnServer = true;
            if (server.username === undefined) { // Don't override value if already set in config.js
                server.username = 'some-username';
            }
            if (server.credential === undefined) {  // Don't override value if already set in config.js
                server.credential = rot13('nhgu-gbxra'); // rot13 of 'nhgu-gbxra' returns 'auth-token'
            }
        }
    }

    // Prepare restore call data c2c_restoreCall
    let data = sessionStorage.getItem('c2c_restoreCall');
    if (data !== null) {
        sessionStorage.removeItem('c2c_restoreCall');

        c2c_restoreCall = JSON.parse(data);
        let delay = Math.ceil(Math.abs(c2c_restoreCall.time - new Date().getTime()) / 1000);
        if (delay > c2c_config.c2c_restoreCallMaxDelay) {
            c2c_ac_log('No restore call, delay is too long (' + delay + ' seconds)');
            c2c_restoreCall = null;
        }
    }

    // GUI initialization
    window.addEventListener('beforeunload', c2c_onBeforeUnload);

    // Prepare audio player
    c2c_audioPlayer.init({ logger: c2c_ac_log });

    // Download sounds (if used). Generate tones.
    await c2c_audioPlayer.downloadSounds('../sounds/', c2c_soundConfig.downloadSounds)

    await c2c_audioPlayer.generateTonesSuite(c2c_soundConfig.generateTones);

    if (c2c_config.dtmfKeypadEnabled) {
        let { A, B, C, D, ...basicDtmfTones } = c2c_audioPlayer.dtmfTones; // exclude A,B,C,D tones
        await c2c_audioPlayer.generateTonesSuite(basicDtmfTones);
    }

    c2c_ac_log('audioPlayer2: sounds are ready');

    if (c2c_devices) {
        let spkrId = c2c_devices.getSelected('speaker').deviceId;
        c2c_audioPlayer.setSpeakerId(spkrId);
        
        // Populate the main interface device selectors
        for (let name of c2c_devices.names) {
            c2c_fillDeviceList(name);
        }
        
        // Set up event handlers for device changes
        for (let name of c2c_devices.names) {
            let selector = document.querySelector(`mc-select[name="${name}"]`) || 
                          document.querySelector(`#${name}_dev mc-select`);
            if (selector) {
                selector.addEventListener('change', function() {
                    let index = parseInt(this.value);
                    if (!isNaN(index)) {
                        c2c_devices.setSelectedIndex(name, index);
                        c2c_ac_log(`Device changed: ${name} set to index ${index}`);
                        
                        // Update constraints
                        if (name === 'microphone') {
                            let micId = c2c_devices.getSelected('microphone').deviceId;
                            c2c_phone.setConstraint('audio', 'deviceId', micId);
                        } else if (name === 'camera') {
                            let camId = c2c_devices.getSelected('camera').deviceId;
                            c2c_phone.setConstraint('video', 'deviceId', camId);
                        } else if (name === 'speaker') {
                            let spkrId = c2c_devices.getSelected('speaker').deviceId;
                            c2c_audioPlayer.setSpeakerId(spkrId);
                        }
                    }
                });
            }
        }
    }

    c2c_gui_phoneBeforeCall();

    if (c2c_restoreCall === null) {
        /* Call auto start after page downloaded */
        let callAutoStart = !!c2c_config.callAutoStart ? c2c_config.callAutoStart.toLowerCase() : 'no';
        if ((callAutoStart === 'yes force') || (callAutoStart === 'yes' && !c2c_audioPlayer.isDisabled())) {
            if (c2c_audioPlayer.isDisabled()) {
                c2c_ac_log('Start call automatically. Warning: audio player is disabled. So you cannot hear beeps!');
            } else {
                c2c_ac_log('Start call automatically');
            }
            c2c_call(true);
        } else if (c2c_config.testCallEnabled && c2c_config.testCallAutoStart) {
            if (c2c_config.testCallUseMicrophone) {
                c2c_ac_log('Test call used microphone. Start test call automatically');
                c2c_call(false);
            } else if (!c2c_audioPlayer.isDisabled()) {
                c2c_ac_log('Test call used recorded sound. Play sound is enabled by Auto-Play policy. Start test call automatically');
                c2c_call(false);
            } else {
                c2c_ac_log('Test call used recorded sound. Play sound is disabled by Auto-Play policy. Please press button to start test call');
            }
        }
    }

    // Restore call after page reload
    if (c2c_restoreCall !== null) {
        c2c_ac_log('Trying to restore call', c2c_restoreCall);
        c2c_call(true);
    }
}
// Get mandatory HTML elements references
function c2c_getHTMLPageReferences() {
    c2c_widgetDiv = document.getElementById('c2c_widget_div');
    if (!c2c_widgetDiv) {
        c2c_ac_log('Fatal error: HTML missed div id="c2c_widget"');
        return false;
    }

    // Try to get the start call button first, then the end call button
    c2c_callButton = document.getElementById('start-call-btn') || document.getElementById('c2c_call_btn');
    if (!c2c_callButton) {
        c2c_ac_log('Fatal error: HTML missed button id="start-call-btn" or "c2c_call_btn"');
        return false;
    }

    // Save original call button title.
    c2c_callButtonTitle = c2c_callButton.title;

    c2c_remoteVideo = document.getElementById('c2c_remote_video');
    if (!c2c_remoteVideo) {
        c2c_ac_log('Fatal error: HTML missed video element id="c2c_remote_video"');
        return false;
    }
    c2c_localVideo = document.getElementById('c2c_local_video');
    if (!c2c_localVideo) {
        c2c_ac_log('Fatal error: HTML missed video element id="c2c_local_video"');
        return false;
    }

    c2c_status_line = document.getElementById('c2c_status_line');
    if (!c2c_status_line) {
        c2c_ac_log('Fatal error: HTML missed div id="c2c_status_line"');
        return false;
    }

    // Get HTML element if select devices feature used.
    if (c2c_devices) {
        c2c_selectDevicesButton = document.getElementById('c2c_select_devices_btn');
        c2c_selectDevicesDiv = document.getElementById('c2c_select_devices_div');
    }

    if (c2c_config.dtmfKeypadEnabled) {
        c2c_keypadButton = document.getElementById('c2c_keypad_btn');
        c2c_keypadDiv = document.getElementById('c2c_keypad_div');
        c2c_keypadInput = document.getElementById('c2c_keypad_input');
        c2c_keypadClearButton = document.getElementById('c2c_keypad_clear_btn');
    }

    // Get mute button reference
    c2c_muteButton = document.getElementById('c2c_mute_btn');

    // Get hold button reference
    c2c_holdButton = document.getElementById('c2c_hold_btn');

    // Get callback phone number input
    c2c_callbackPhoneInput = document.getElementById('c2c_callback_phone');

    // Get login elements
    c2c_usernameInput = document.getElementById('c2c_username');
    c2c_passwordInput = document.getElementById('c2c_password');
    c2c_loginButton = document.getElementById('c2c_login_btn');
    c2c_loginSection = document.getElementById('login-section');
    c2c_mainApplication = document.getElementById('main-application');

    // Get HTML elements for testCallEnabled mode
    if (c2c_config.testCallEnabled) {
        // Optional
        c2c_connectionSpeedDiv = document.getElementById('c2c_connection_speed_div');

        // Mandatory
        c2c_testCallQualityDiv = document.getElementById('c2c_test_call_quality_div');
        c2c_testButton = document.getElementById('c2c_test_btn');

        if (!c2c_testCallQualityDiv) {
            c2c_ac_log('Fatal error: Mode testCallEnabled and HTML missed span id="c2c_quality_span"');
            return false;
        }
        if (!c2c_testButton) {
            c2c_ac_log('Fatal error: Mode testCallEnabled and HTML missed button id="c2c_test_btn"');
            return false;
        }
    }

    // Get HTML elements for call type 'user_control'
    c2c_videoSpan = document.getElementById('c2c_video_chk_span');
    c2c_videoCheckbox = document.getElementById('c2c_video_chk');
    c2c_cameraButton = document.getElementById('c2c_camera_btn');
    c2c_cameraLineSvg = document.getElementById('c2c_camera_line_svg');

    if (c2c_config.type === 'user_control') {
        if (!c2c_videoSpan) {
            c2c_ac_log('Fatal error: Call type is "user_control" and HTML missed span id="c2c_video_chk_span"');
            return false;
        }
        if (!c2c_videoCheckbox) {
            c2c_ac_log('Fatal error: Call type is "user_control" and HTML missed checkbox id="c2c_video_chk"');
            return false;
        }

        if (!c2c_cameraButton) {
            c2c_ac_log('Fatal error: Call type is "user_control" and HTML missed button id="c2c_camera_btn"');
            return false;
        }
        if (!c2c_cameraLineSvg) {
            c2c_ac_log('Fatal error: Call type is "user_control" and HTML missed svg id="c2c_camera_line_svg"');
            return false;
        }
    }

    // Set click events for keypad buttons
    if (c2c_config.dtmfKeypadEnabled) {
        let keypadGrid = document.getElementById('c2c_keypad_grid');
        if (keypadGrid) {
            let keypadButtons = keypadGrid.querySelectorAll('.keypad-btn');
            for (let button of keypadButtons) {
                button.addEventListener('click', () => c2c_sendDtmf(button.getAttribute('data-key')));
            }
        }
    }

    if (c2c_config.selfVideoEnabled) {
        c2c_selfVideoSpan = document.getElementById('c2c_self_video_chk_span')
        c2c_selfVideoChk = document.getElementById('c2c_self_video_chk');
        if (!c2c_selfVideoSpan) {
            c2c_ac_log('Fatal error: missed span id="c2c_self_video_chk_span"');
            return false;
        }
        if (!c2c_selfVideoChk) {
            c2c_ac_log('Fatal error: missed span id="c2c_self_video_chk"');
            return false;
        }

        c2c_isSelfVideo = c2c_config.selfVideoCheckboxDefault;
        c2c_selfVideoChk.checked = c2c_isSelfVideo;
    }

    return true;
}

// Use any button interaction to enable sound
function c2c_buttonHandler(name, handler) {
    c2c_ac_log(`phone>> "${name}" onclick event`);
    if (!c2c_audioPlayer.isDisabled()) {
        handler();
        return;
    }
    c2c_ac_log('Let enable sound...');
    c2c_audioPlayer.enable()
        .then(() => {
            c2c_ac_log('Sound is enabled')
        })
        .catch((e) => {
            c2c_ac_log('Cannot enable sound', e);
        })
        .finally(() => {
            handler();
        });
}

// Get URL parameters
function c2c_getStrUrlParameter(name, defValue = null) {
    let s = window.location.search.split('&' + name + '=')[1];
    if (!s) s = window.location.search.split('?' + name + '=')[1];
    return s !== undefined ? decodeURIComponent(s.split('&')[0]) : defValue;
}

function c2c_getIntUrlParameter(name, defValue = null) {
    let s = window.location.search.split('&' + name + '=')[1];
    if (!s) s = window.location.search.split('?' + name + '=')[1];
    return s !== undefined ? parseInt(decodeURIComponent(s.split('&')[0])) : defValue;
}

// Filter for URL parameters values (e.g. to remove '-' characters)
function c2c_stringDropCharacters(text, removeChars) {
    let result = '';
    for (let c of text) {
        if (!removeChars.includes(c))
            result += c;
    }
    return result;
}

function c2c_delay(ms) { return new Promise((r) => { setTimeout(() => r(), ms); }); }

// Format duration in seconds to MM:SS format
function c2c_formatDuration(seconds) {
    let minutes = Math.floor(seconds / 60);
    let remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Start the call timer
function c2c_startCallTimer() {
    c2c_stopCallTimer(); // Make sure any existing timer is stopped
    
    let callTimerElement = document.getElementById('call-timer');
    if (!callTimerElement || !c2c_activeCall) {
        return;
    }
    
    c2c_callTimer = setInterval(() => {
        if (c2c_activeCall && c2c_activeCall.isEstablished()) {
            let duration = Math.floor(c2c_activeCall.duration());
            callTimerElement.textContent = c2c_formatDuration(duration);
        }
    }, 1000);
    
    // Initial update
    if (c2c_activeCall && c2c_activeCall.isEstablished()) {
        let duration = Math.floor(c2c_activeCall.duration());
        callTimerElement.textContent = c2c_formatDuration(duration);
    }
}

// Stop the call timer
function c2c_stopCallTimer() {
    if (c2c_callTimer) {
        clearInterval(c2c_callTimer);
        c2c_callTimer = null;
    }
    
    // Reset timer display
    let callTimerElement = document.getElementById('call-timer');
    if (callTimerElement) {
        callTimerElement.textContent = '00:00';
    }
}

function c2c_timestamp() {
    let date = new Date();
    let h = date.getHours();
    let m = date.getMinutes();
    let s = date.getSeconds();
    let ms = date.getMilliseconds();
    return ((h < 10) ? '0' + h : h) + ':' + ((m < 10) ? '0' + m : m) + ':' + ((s < 10) ? '0' + s : s) + '.' + ('00' + ms).slice(-3) + ' ';
}

// Search server address in array of addresses
function c2c_searchServerAddress(addresses, searchAddress) {
    searchAddress = searchAddress.toLowerCase();
    for (let ix = 0; ix < addresses.length; ix++) {
        let data = addresses[ix]; // can be address or [address, priority]
        let address = data instanceof Array ? data[0] : data;
        if (address.toLowerCase() === searchAddress)
            return ix;
    }
    return -1;
}

function c2c_setConsoleLoggers() {
    let useColor = ['chrome', 'firefox', 'safari'].includes(c2c_phone.getBrowser());
    const log1 = function () {
        let args = [].slice.call(arguments);
        let firstArg = [c2c_timestamp() + '' + (useColor ? '%c' : '') + args[0]];
        if (useColor) firstArg = firstArg.concat(['color: BlueViolet;']);
        console.log.apply(console, firstArg.concat(args.slice(1)));
    };
    let log2 = function () {
        let args = [].slice.call(arguments);
        let firstArg = [c2c_timestamp() + args[0]];
        console.log.apply(console, firstArg.concat(args.slice(1)));
    };
    c2c_ac_log = log1;              // phone log
    c2c_phone.setAcLogger(log1);    // api log
    c2c_phone.setJsSipLogger(log2); // jssip log
}

function c2c_setWebsocketLoggers(url) {
    return new Promise((resolve, reject) => {
        let ws = new WebSocket('wss://' + url, 'wslog');
        ws.onopen = () => { resolve(ws); }
        ws.onerror = (e) => { reject(e); }
    })
        .then(ws => {
            const log = function () {
                let args = [].slice.call(arguments);
                let msg = [c2c_timestamp() + args[0]].concat(args.slice(1)).join();
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(msg + '\n');
                } else {
                    console.log(msg);
                }
            };
            c2c_ac_log(`Sending log to "${url}"`);
            c2c_ac_log = log;
            c2c_phone.setAcLogger(log);
            c2c_phone.setJsSipLogger(log);
        })
}

// Connect to SBC server, don't send REGISTER
function c2c_initStack(account) {
    // restore previosly connected SBC after page reloading.
    if (c2c_restoreCall !== null) {
        let ix = c2c_searchServerAddress(c2c_serverConfig.addresses, c2c_restoreCall.address);
        if (ix !== -1) {
            c2c_ac_log('Page reloading, raise priority of previously connected server: "' + c2c_restoreCall.address + '"');
            c2c_serverConfig.addresses[ix] = [c2c_restoreCall.address, 1000];
        } else {
            c2c_ac_log('Cannot find previously connected server: ' + c2c_restoreCall.address + ' in configuration');
        }
    }
    c2c_phone.setServerConfig(c2c_serverConfig.addresses, c2c_serverConfig.domain, c2c_serverConfig.iceServers);
    c2c_phone.setAccount(account.user, account.displayName, account.password);
    c2c_phone.setWebSocketKeepAlive(c2c_config.pingInterval, c2c_config.pongTimeout, c2c_config.timerThrottlingBestEffort, c2c_config.pongReport, c2c_config.pongDist);

    // Set c2c_phone API listeners
    c2c_phone.setListeners({
        loginStateChanged: function (isLogin, cause) {
            switch (cause) {
                case 'connected':
                    c2c_ac_log('phone>>> loginStateChanged: connected');
                    c2c_isWsConnected = true;
                    if (c2c_activeCall !== null) {
                        c2c_ac_log('phone: active call exists (SBC might have switched over to secondary)');
                        break;
                    }
                    if (c2c_restoreCall !== null) {
                        if (c2c_selfVideoChk) {
                            c2c_isSelfVideo = c2c_restoreCall.selfVideo;
                            c2c_selfVideoChk.checked = c2c_isSelfVideo;
                        }
                        c2c_ac_log('send INVITE with Replaces to restore call');
                        c2c_makeCall(c2c_restoreCall.callTo,
                            c2c_restoreCall.video === 'sendrecv' || c2c_restoreCall.video === 'sendonly' ? c2c_phone.VIDEO : c2c_phone.AUDIO
                            , ['Replaces: ' + c2c_restoreCall.replaces]);
                    } else if (c2c_isStartCall) {
                        c2c_startCall();
                    }
                    break;

                case 'disconnected':
                    c2c_ac_log('phone>>> loginStateChanged: disconnected');
                    c2c_isWsConnected = false;
                    if (c2c_phone.isInitialized()) {
                        if (c2c_sbcDisconnectCounter++ >= c2c_sbcDisconnectCounterMax && c2c_activeCall === null) {
                            c2c_ac_log('phone: too many disconnections.');
                            c2c_phone.deinit();
                            c2c_info('Cannot connect to SBC server');
                            c2c_gui_phoneBeforeCall();
                        }
                    }
                    break;

                case 'login failed':
                    c2c_ac_log('phone>>> loginStateChanged: login failed');
                    break;

                case 'login':
                    c2c_ac_log('phone>>> loginStateChanged: login');
                    break;

                case 'logout':
                    c2c_ac_log('phone>>> loginStateChanged: logout');
                    break;
            }
        },

        outgoingCallProgress: function (call, response) {
            c2c_ac_log('phone>>> outgoing call progress');
            if (c2c_isRegularCall) {
                c2c_info('Ringing', true);
                c2c_audioPlayer.play(c2c_soundConfig.play.outgoingCallProgress);
            }
        },

        callTerminated: function (call, message, cause, redirectTo) {
            c2c_ac_log(`phone>>> call terminated callback, cause=${cause}`);
            c2c_activeCall = null;
            // Stop the call timer
            c2c_stopCallTimer();
            
            if (cause === 'Redirected') {
                c2c_ac_log(`Redirect call to ${redirectTo}`);
                c2c_makeCall(redirectTo, c2c_videoOption());
                return;
            }

            c2c_audioPlayer.stop();
            if (c2c_isRegularCall) {
                let terminatedInfo = cause;  // '<span style="font-weight:bold">' + c2c_config.call + '</span> ' + cause;
                c2c_info(terminatedInfo, true);
                if (call.isOutgoing() && !call.wasAccepted()) {
                    // Busy tone.
                    c2c_audioPlayer.play(c2c_soundConfig.play.busy);
                } else {
                    // Disconnect tone.
                    c2c_audioPlayer.play(c2c_soundConfig.play.disconnect);
                }

            } else {
                if (!call.wasAccepted()) { // sent or received SIP 2xx response
                    c2c_ac_log('Warning: Test call is failed !');
                    c2c_info('Test line is failed');
                } else if (c2c_config.testCallSBCScore) {
                    // Get BYE X-VoiceQuality header.
                    try {
                        if (!message)
                            throw 'No BYE message';
                        let vq = getXVoiceQuality(message);
                        if (vq) {
                            let text = c2c_config.testCallQualityText[vq.color];
                            c2c_ac_log(`BYE: "X-VoiceQuality" header: score="${vq.score}", color="${vq.color}" text="${text}"`);
                            if (c2c_testCallQualityDiv) {
                                c2c_testCallQualityDiv.innerHTML = 'Test call quality: <span style="color:' +
                                    vq.color + ';font-weight:bold">' + text + '</span>';
                            }
                            c2c_info('Test passed', true);
                        } else {
                            c2c_ac_log('BYE: missing "X-VoiceQuality" header');
                            throw 'BYE: missing "X-VoiceQuality" header';
                        }
                    } catch (e) {
                        c2c_ac_log('Warning: cannot take SBC voice quality information', e)
                        c2c_info('Test failed', true);
                    }
                }
            }

            if (c2c_sbcDisconnectDelay === 0) {
                c2c_phone.deinit();
            } else {
                c2c_sbcDisconnectTimer = setTimeout(() => {
                    c2c_ac_log('The time interval between the end of the call and SBC disconnection is over');
                    c2c_phone.deinit();
                }, c2c_sbcDisconnectDelay * 1000);
            }

            c2c_gui_phoneBeforeCall();

            // Hide black rectangles after video call
            c2c_setLocalVideoVisible(false);
            c2c_setRemoteVideoVisible(false);
            c2c_localVideo.srcObject = null;
            c2c_remoteVideo.srcObject = null;

            c2c_restoreCall = null;
        },

        callConfirmed: async function (call, message, cause) {
            c2c_ac_log('phone>>> callConfirmed');
            c2c_audioPlayer.stop();

            c2c_setLocalVideoVisible(c2c_isSelfVideo && c2c_activeCall.hasSendVideo());
            c2c_setRemoteVideoVisible(c2c_activeCall.hasReceiveVideo());

            c2c_gui_phoneDuringCall();

            if (c2c_isRegularCall) {
                c2c_info('Call is established', true);
                // Start the call timer
                c2c_startCallTimer();

                if (c2c_restoreCall !== null && c2c_restoreCall.hold.includes('remote')) {
                    c2c_ac_log('Restore remote hold');
                    c2c_info('Hold');
                    c2c_activeCall.setRemoteHoldState();
                }

                if (c2c_dtmfSequence !== null && c2c_restoreCall === null) {
                    if (c2c_dtmfDelay > 0) {
                        c2c_ac_log(`Wait ${c2c_dtmfDelay}ms before DTMF sending...`);
                        await c2c_delay(c2c_dtmfDelay);
                    }

                    c2c_ac_log(`Send DTMF sequence: ${c2c_dtmfSequence}`);
                    for (let key of c2c_dtmfSequence) {
                        c2c_activeCall.sendDTMF(key);
                    }
                }

                if (!c2c_hasMicrophone) {
                    c2c_info('Warning: No microphone');
                    c2c_ac_log('Play "noMicrophoneSound"');
                    c2c_audioPlayer.play(c2c_soundConfig.play.noMicrophoneSound, c2c_streamDest);
                }
            } else {
                await c2c_voiceQualityTesting();
            }
        },

        callShowStreams: function (call, localStream, remoteStream) {
            c2c_ac_log('phone>>> callShowStreams');
            c2c_audioPlayer.stop();

            // The speaker selection works only in Chrome (except iOS Chrome)
            if (!c2c_devices) {
                c2c_remoteVideo.srcObject = remoteStream;
                c2c_remoteVideo.volume = c2c_isRegularCall ? 1.0 : c2c_config.testCallVolume;
            } else {
                c2c_setRemoteVideoSinkId()
                    .catch((e) => {
                        c2c_ac_log(`Warning: remove video HTMLVideoElement.setSinkId(): "${e.message}" [Used default browser speaker]`, e);
                    })
                    .finally(() => {
                        c2c_remoteVideo.srcObject = remoteStream;
                        c2c_remoteVideo.volume = c2c_isRegularCall ? 1.0 : c2c_config.testCallVolume;
                    });
            }

            if (c2c_isSelfVideo && c2c_activeCall.hasSendVideo())
                c2c_showSelfVideo(true);
        },

        incomingCall: function (call, invite) {
            c2c_ac_log('phone>>> incomingCall');
            call.reject();
        },

        callHoldStateChanged: function (call, isHold, isRemote) {
            c2c_ac_log('phone>>> callHoldStateChanged');
            if (call.isRemoteHold()) {
                c2c_gui_phoneOnRemoteHold()
            } else {
                c2c_gui_phoneDuringCall();
            }
            
            // Update hold button state when hold state changes
            c2c_updateHoldButtonState();
        },

        callIncomingReinvite: function (call, start, request) {
            if (start)
                return;
            c2c_setRemoteVideoVisible(call.hasReceiveVideo());

            if (call.hasReceiveVideo() && !call.hasSendVideo() && c2c_hasCamera) {
                if (!call.hasEnabledSendVideo()) {
                    // Other side add video
                    c2c_info('You are invited to turn on your camera', true);
                } else {
                    c2c_ac_log('Other side disable receive video for video call');
                }
            }
        },

        incomingNotify: function (call, eventName, from, contentType, body, request) {
            c2c_ac_log(`phone>>> incoming NOTIFY "${eventName}"`, call, from, contentType, body);
            if (call !== null)
                return false; // Skip in dialog NOTIFY.

            // AudioCodes out of dialog NOTIFY with voice quality
            if (eventName === 'vq') {
                let vq = getXVoiceQuality(request);
                if (vq) {
                    let text = c2c_config.testCallQualityText[vq.color];
                    c2c_ac_log(`NOTIFY: "X-VoiceQuality" header: score="${vq.score}", color="${vq.color}" text="${text}"`);
                } else {
                    c2c_ac_log('NOTIFY: missing "X-VoiceQuality" header');
                }
                return true;
            } else {
                return false;
            }
        }
    });

    c2c_sbcDisconnectCounter = 0;

    // Other side allowed to add video for call type: 'video' or 'user_control'
    // call type 'audio' is limited to audio only.
    c2c_phone.setEnableAddVideo(c2c_config.type !== 'audio');
    c2c_phone.setNetworkPriority(c2c_config.networkPriority);
    c2c_phone.setModes(c2c_config.modes);
    c2c_phone.init(false);
}

// AudioCodes X-VoiceQuality header parser
function getXVoiceQuality(request) {
    let header = request.getHeader('X-VoiceQuality');
    if (!header) {
        return undefined;
    }
    let words = header.trim().split(' ');
    if (words.length !== 2) {
        console.log('X-VoiceQuality header: parsing problem: must be 2 tokens');
        return undefined;
    }
    let score = parseInt(words[0]);
    if (isNaN(score)) {
        console.log('X-VoiceQuality header: parsing problem: the first token is not number');
        return undefined;
    }
    let color = words[1].trim().toLowerCase();
    return { score, color };
}

// Prepare restore call after page reload.
function c2c_onBeforeUnload() {
    c2c_ac_log('phone>>> beforeunload event');
    if (c2c_phone === null || !c2c_phone.isInitialized())
        return;
    if (c2c_activeCall !== null && c2c_isRegularCall) {
        if (c2c_activeCall.isEstablished()) {
            let data = {
                callTo: c2c_activeCall.data['_user'],
                video: c2c_activeCall.getVideoState(), // sendrecv, sendonly, recvonly, inactive
                replaces: c2c_activeCall.getReplacesHeader(),
                time: new Date().getTime(),
                hold: `${c2c_activeCall.isLocalHold() ? 'local' : ''}${c2c_activeCall.isRemoteHold() ? 'remote' : ''}`,
                address: c2c_phone.getServerAddress(),
                selfVideo: c2c_isSelfVideo
            }
            sessionStorage.setItem('c2c_restoreCall', JSON.stringify(data));
        } else {
            c2c_activeCall.terminate(); // send BYE or CANCEL
        }
    }
}

function c2c_videoOption() {
    if (!c2c_hasCamera)
        return c2c_phone.AUDIO;
    switch (c2c_config.type) {
        case 'audio':
            return c2c_phone.AUDIO;
        case 'video':
            return c2c_phone.VIDEO;
        case 'user_control':
            return c2c_videoCheckbox.checked ? c2c_phone.VIDEO : c2c_phone.AUDIO;
        default:
            c2c_ac_log(`Warning: c2c_videoOption(): Illegal value of c2c_config.type Used: 'audio'`);
            return c2c_phone.AUDIO;
    }
}

function c2c_selectDevices() {
    c2c_ac_log('c2c_selectDevices()');
    c2c_info('');
    let doneBtn = document.getElementById('select_devices_done_btn');
    if (doneBtn) {
        doneBtn.onclick = c2c_selectDevicesDone;
    }
    c2c_devices.enumerate(true)
        .catch((e) => {
            c2c_ac_log('getUserMedia() exception', e);
        })
        .finally(() => {
            for (let name of c2c_devices.names) {
                c2c_fillDeviceList(name);
            }
            c2c_gui_DeviceSelection();
        });
}

function c2c_fillDeviceList(name) {
    let device = c2c_devices.getDevice(name); // name is one of 'microphone', 'speaker', 'camera', 'ringer'
    
    // Try multiple selectors to find the device selection element
    let selector = document.querySelector(`#c2c_devices [name=${name}]`) || 
                   document.querySelector(`#${name}_dev mc-select`) ||
                   document.querySelector(`mc-select[name="${name}"]`) ||
                   document.querySelector(`#${name}_dev_old select[name="${name}_old"]`);
    
    if (!selector) {
        c2c_ac_log(`Warning: Device selector not found for ${name}`);
        c2c_ac_log(`Tried selectors: #c2c_devices [name=${name}], #${name}_dev mc-select, mc-select[name="${name}"], #${name}_dev_old select[name="${name}_old"]`);
        return;
    }
    
    c2c_ac_log(`Found device selector for ${name}: ${selector.tagName} with ID: ${selector.id || 'none'}`);

    // Handle mc-select components differently than regular select elements
    if (selector.tagName.toLowerCase() === 'mc-select') {
        // Clear mc-select options
        const options = selector.querySelectorAll('mc-option');
        options.forEach(option => option.remove());
        
        if (device.incomplete) {
            selector.disabled = true;
            c2c_ac_log(`Warning: To device selection let enable ${name} usage`);
        } else {
            selector.disabled = false;
        }
        
        // Add mc-option elements for mc-select
        for (let ix = 0; ix < device.list.length; ix++) {
            let dev = device.list[ix];
            let option = document.createElement("mc-option");
            option.setAttribute('value', ix.toString());
            option.textContent = dev.label;
            if (device.index === ix) {
                selector.value = ix.toString();
            }
            selector.appendChild(option);
        }
    } else {
        // Handle regular select elements (old method)
        while (selector.firstChild) {
            selector.removeChild(selector.firstChild);
        }
        if (device.incomplete) {
            selector.disabled = true;
            c2c_ac_log(`Warning: To device selection let enable ${name} usage`);
        } else {
            selector.disabled = false;
        }
        // Loop by device labels and add option elements.
        for (let ix = 0; ix < device.list.length; ix++) {
            let dev = device.list[ix]
            let option = document.createElement("option");
            option.text = dev.label;      // device name
            option.value = ix.toString(); // index in device list
            option.selected = (device.index === ix); // selected device
            selector.add(option);
        }
    }

    // Hide camera selection for audio only call.
    if (name === 'camera' && c2c_config.type === 'audio') {
        let cameraDiv = document.getElementById('camera_dev') || document.getElementById('camera_dev_old');
        if (cameraDiv) cameraDiv.style.display = 'none';
        return;
    }

    let deviceDiv = document.getElementById(`${name}_dev`) || document.getElementById(`${name}_dev_old`);
    if (deviceDiv) {
        deviceDiv.style.display = (device.list.length > 1) ? 'block' : 'none';
    }
}

function c2c_selectDevicesDone() {
    for (let name of c2c_devices.names) {
        let selectElement = document.querySelector(`#c2c_devices [name=${name}]`) || 
                           document.querySelector(`#${name}_dev mc-select`) ||
                           document.querySelector(`mc-select[name="${name}"]`) ||
                           document.querySelector(`#${name}_dev_old select[name="${name}_old"]`);
        
        if (!selectElement) {
            c2c_ac_log(`Warning: Could not find select element for ${name} device`);
            continue;
        }
        
        let index = -1;
        
        // Handle mc-select elements
        if (selectElement.tagName.toLowerCase() === 'mc-select') {
            let value = selectElement.value;
            if (value !== undefined && value !== null && value !== '') {
                index = parseInt(value);
            }
        } else {
            // Handle regular select elements
            index = selectElement.selectedIndex;
            if (index !== -1) { // -1 indicates that no element is selected
                let n = selectElement.options[index].value;
                index = parseInt(n);
            }
        }
        
        if (index !== -1) {
            c2c_devices.setSelectedIndex(name, index);
        }
    }

    let selectedDevices = c2c_devices.store();

    // To restore after page reload.
    sessionStorage.setItem('c2c_selectedDevices', JSON.stringify(selectedDevices));

    let str = 'Devices done: selected';
    for (let name of c2c_devices.names) {
        if (c2c_devices.getNumber(name) > 1) {
            str += `\n${name}: "${c2c_devices.getSelected(name).label}"`;
        }
    }
    c2c_ac_log(str);

    let micId = c2c_devices.getSelected('microphone').deviceId;
    c2c_phone.setConstraint('audio', 'deviceId', micId);

    let camId = c2c_devices.getSelected('camera').deviceId;
    c2c_phone.setConstraint('video', 'deviceId', camId);

    let spkrId = c2c_devices.getSelected('speaker').deviceId;
    c2c_audioPlayer.setSpeakerId(spkrId);

    c2c_gui_phoneBeforeCall();
}

function c2c_setRemoteVideoSinkId() {
    let deviceId = c2c_devices.getSelected('speaker').deviceId;
    if (deviceId === null)
        deviceId = ''; // remove sinkId
    if (c2c_remoteVideoDeviceId === deviceId) {
        c2c_ac_log('c2c: remote video: sinkId is already assigned');
        return Promise.resolve();
    }
    if (!c2c_remoteVideo.setSinkId) {
        return Promise.reject(new Error('setSinkId is not implemented'));
    }
    c2c_ac_log(`c2c: remove video: setSinkId "${deviceId}"`);
    c2c_remoteVideo.srcObject = null; // probably setSinkId check srcObject
    return c2c_remoteVideo.setSinkId(deviceId)
        .then(() => {
            c2c_ac_log(`c2c: remote video: setSinkId completed`);
            c2c_remoteVideoDeviceId = deviceId;
        });
}

function c2c_cameraToggle() {
    c2c_ac_log('c2c_cameraToggle()');
    c2c_info('');
    if (!c2c_activeCall.hasEnabledSendVideo()) {
        if (c2c_cameraButton) c2c_cameraButton.disabled = true;
        c2c_activeCall.startSendingVideo()
            .then(() => {
                c2c_gui_phoneDuringCall();
                if (c2c_isSelfVideo) {
                    c2c_showSelfVideo(true);
                }
                c2c_setRemoteVideoVisible(c2c_activeCall.hasReceiveVideo());
            })
            .catch((e) => {
                c2c_ac_log('c2c error during start video', e);
            })
            .finally(() => {
                if (c2c_cameraButton)
                    c2c_cameraButton.disabled = false;
            });
    } else {
        c2c_activeCall.stopSendingVideo()
            .then(() => {
                c2c_gui_phoneDuringCall();
                if (c2c_isSelfVideo) {
                    c2c_showSelfVideo(false);
                }
                c2c_setRemoteVideoVisible(c2c_activeCall.hasReceiveVideo());
            })
            .catch((e) => {
                c2c_ac_log('stop sending video failure', e);
            })
            .finally(() => {
                if (c2c_cameraButton)
                    c2c_cameraButton.disabled = false;
            });
    }
}

async function c2c_call(isRegular) {
    // For regular call call optional c2c_create_header function
    // to fill X header. The header will be added to initial INVITE.
    if (isRegular && typeof (c2c_create_x_header) === 'function') {
        try {
            c2c_x_header = c2c_create_x_header();
        } catch (e) {
            c2c_info(e);
            c2c_ac_log('Exception in function c2c_create_x_header', e);
            return;
        }
    }

    if (c2c_sbcDisconnectTimer !== null) {
        clearTimeout(c2c_sbcDisconnectTimer);
        c2c_sbcDisconnectTimer = null;
    }

    c2c_isRegularCall = isRegular;
    c2c_isStartCall = true;
    c2c_audioPlayer.stop();

    c2c_gui_phoneCalling();

    if (!c2c_phone.isInitialized()) {
        try {
            // the call will start when the sbc is connected
            await c2c_sbc_connect_sequence();
        } catch (e) {
            c2c_ac_log('phone initialization or SBC connecting error:', e);
            c2c_info(e);
            c2c_gui_phoneBeforeCall();
        }
    } else if (c2c_isWsConnected) {
        c2c_startCall();
    } else {
        c2c_ac_log('SIP is already initialized. websocket is disconnected. Wait connection...');
    }
}

async function c2c_sbc_connect_sequence() {
    c2c_info('Connecting');
    
    // Get callback phone number if provided, otherwise use default config
    let callerNumber = c2c_callbackPhoneInput && c2c_callbackPhoneInput.value.trim() 
                      ? c2c_callbackPhoneInput.value.trim() 
                      : c2c_config.caller;
    
    let callerDisplayName = c2c_callbackPhoneInput && c2c_callbackPhoneInput.value.trim() 
                           ? c2c_callbackPhoneInput.value.trim() 
                           : c2c_config.callerDN;
    
    c2c_ac_log(`Using caller: ${callerNumber}, display name: ${callerDisplayName}`);
    c2c_initStack({ user: callerNumber, displayName: callerDisplayName, password: '' });
}

function c2c_startCall() {
    c2c_isStartCall = false;
    if (c2c_isRegularCall) {
        c2c_makeCall(c2c_config.call, c2c_videoOption());
    } else {
        c2c_makeCall(c2c_config.testCallUser, c2c_phone.AUDIO);
    }
}

function c2c_makeCall(callTo, videoMode, extraHeaders = []) {
    let extraOptions = {};
    if (c2c_activeCall !== null)
        throw 'Already exists active call';

    c2c_info('Calling', true);
    if (c2c_serverConfig.iceTransportPolicyRelay && c2c_usedTurnServer) {
        c2c_ac_log("Used TURN debugging iceTransportPolicy: 'relay'");
        extraOptions.pcConfig = { iceTransportPolicy: 'relay' };
    }

    // Normally used microphone sound. 
    // It is also possible to play the recorded sound.
    if ((c2c_isRegularCall && !c2c_hasMicrophone) ||
        (!c2c_isRegularCall && !c2c_config.testCallUseMicrophone)) {
        // Prepare media stream to play recorded sound.
        c2c_streamDest = c2c_audioPlayer.audioCtx.createMediaStreamDestination();
        extraOptions.mediaStream = c2c_streamDest.stream;
    }

    // For test call & SBC quality score added X-AC-Action SIP header.
    if (!c2c_isRegularCall && c2c_config.testCallSBCScore) {
        extraHeaders.push('X-AC-Action: test-voice-quality');
        callTo = `${callTo}@${c2c_serverConfig.domain};duration=${c2c_config.testCallMinDuration * 1000}`;
    }

    // For regular call can be added user defined SIP X header.
    if (c2c_isRegularCall && c2c_x_header) {
        extraHeaders.push(c2c_x_header);
    }
    // For regular call can be added security token.
    if (c2c_isRegularCall && c2c_token) {
        extraHeaders.push(`X-Token: ${c2c_token}`);
    }

    c2c_activeCall = c2c_phone.call(videoMode, callTo, extraHeaders, extraOptions);
}

function c2c_hangupCall() {
    if (c2c_activeCall !== null) {
        c2c_activeCall.terminate();
        c2c_activeCall = null;
        
        // Restore UI to before call state
        c2c_gui_phoneBeforeCall();
    }
}


function c2c_setVideoVisible(elem, visible) {
    let es = elem.style;
    es.display = 'block';
    if (visible) {
        es.width = c2c_config.videoSize.width;
        es.height = c2c_config.videoSize.height;
    } else {
        es.width = 0;
        es.height = 0;
    }
}

function c2c_setLocalVideoVisible(visible) {
    c2c_setVideoVisible(c2c_localVideo, visible);
}

function c2c_setRemoteVideoVisible(visible) {
    c2c_setVideoVisible(c2c_remoteVideo, visible);
}

function c2c_selfVideoToggle() {
    c2c_ac_log('c2c_selfVideoToggle()');
    c2c_isSelfVideo = c2c_selfVideoChk.checked;
    c2c_showSelfVideo(c2c_isSelfVideo);
}

function c2c_showSelfVideo(show) {
    if (show && c2c_activeCall !== null && c2c_activeCall.hasSendVideo()) {
        c2c_ac_log('show self-video');
        c2c_localVideo.srcObject = c2c_activeCall.getRTCLocalStream();
        c2c_localVideo.volume = 0;
        c2c_setLocalVideoVisible(true);
    } else {
        c2c_ac_log('hide self-video');
        c2c_localVideo.srcObject = null;
        c2c_setLocalVideoVisible(false);
    }
}


// Display message, and optionally clean it after delay.
function c2c_info(text, clear = false) {
    c2c_status_line.innerHTML = text;
    c2c_status_line.dataset.id = ++c2c_messageId;
    if (clear) {
        (function (id) {
            setTimeout(() => {
                if (c2c_status_line.dataset.id === id) {
                    c2c_status_line.innerHTML = '';
                }
            }, c2c_config.messageDisplayTime * 1000);
        })(c2c_status_line.dataset.id);
    }
}

// Test call. Voice quality testing 
async function c2c_voiceQualityTesting() {
    c2c_ac_log('Test call is established');
    if (c2c_config.testCallUseMicrophone) {
        c2c_ac_log('Test call plays microphone sound');
    } else {
        c2c_ac_log('Test call plays recorded sound');
        c2c_audioPlayer.play(c2c_soundConfig.play.testCallSound, c2c_streamDest);
    }

    c2c_info('Checking line quality...');
    if (c2c_config.testCallSBCScore) {
        // SBC works with RTP/RTCP statistics and send report in BYE X-VoiceQuality header
        c2c_ac_log('Checking line quality (SBC test)...');
    } else {
        // RTP/RTCP statistics are obtained from browser WebRTC API.
        if (typeof c2c_browserVoiceQualityTest === 'undefined') {
            c2c_info('Warning: Missed browser voice test', true);
            c2c_ac_log('Warning: voice_quality.js is not loaded');
            c2c_activeCall.terminate();
            return;
        }
        await c2c_browserVoiceQualityTest();
    }
}

function c2c_keypadToggle() {
    if (getComputedStyle(c2c_keypadDiv).getPropertyValue('display') === 'none') {
        c2c_ac_log('show keypad');
        c2c_keypadDiv.style.display = 'block';
    } else {
        c2c_ac_log('hide keypad');
        c2c_keypadDiv.style.display = 'none';
    }
}

function c2c_sendDtmf(key) {
    // Update the keypad input field
    if (c2c_keypadInput) {
        c2c_keypadInput.value += key;
    }
    
    // Send DTMF tone if call is active
    if (c2c_activeCall) {
        c2c_audioPlayer.play(Object.assign({ 'name': key }, c2c_soundConfig.play.dtmf));
        c2c_activeCall.sendDTMF(key);
    }
}

function c2c_keypadClear() {
    if (c2c_keypadInput) {
        c2c_keypadInput.value = '';
        c2c_ac_log('Keypad input cleared');
    }
}

function c2c_handleLogin() {
    console.log('Login function called');
    console.log('Username input element:', c2c_usernameInput);
    console.log('Password input element:', c2c_passwordInput);
    console.log('Login section element:', c2c_loginSection);
    console.log('Main application element:', c2c_mainApplication);
    
    let username = c2c_usernameInput ? c2c_usernameInput.value.trim() : '';
    let password = c2c_passwordInput ? c2c_passwordInput.value.trim() : '';
    
    console.log('Username:', username);
    console.log('Password:', password ? '[password entered]' : '[no password]');
    
    // Accept any credentials (fake login)
    if (username && password) {
        c2c_ac_log(`Login successful for user: ${username}`);
        console.log('Login successful, hiding login section and showing main app');
        
        // Hide login section and show main application
        if (c2c_loginSection) {
            c2c_loginSection.style.display = 'none';
            console.log('Login section hidden');
        }
        if (c2c_mainApplication) {
            c2c_mainApplication.classList.add('show');
            console.log('Main application shown');
        }
    } else {
        c2c_ac_log('Login failed: Username and password are required');
        console.log('Login failed - missing credentials');
        alert('Please enter both username and password');
    }
}

function c2c_muteToggle() {
    if (c2c_activeCall) {
        let isMuted = c2c_activeCall.isAudioMuted();
        c2c_ac_log(`Toggling mute: currently ${isMuted ? 'muted' : 'unmuted'}`);
        
        // Toggle mute state
        c2c_activeCall.muteAudio(!isMuted);
        
        // Update button appearance and text
        c2c_updateMuteButtonState();
    }
}

function c2c_updateMuteButtonState() {
    if (c2c_activeCall && c2c_muteButton) {
        let isMuted = c2c_activeCall.isAudioMuted();
        
        if (isMuted) {
            c2c_muteButton.setAttribute('appearance', 'danger');
            c2c_muteButton.setAttribute('icon', 'microphone-off');
            c2c_muteButton.textContent = 'Unmute';
            c2c_muteButton.setAttribute('title', 'Unmute Microphone');
        } else {
            c2c_muteButton.setAttribute('appearance', 'neutral');
            c2c_muteButton.setAttribute('icon', 'microphone');
            c2c_muteButton.textContent = 'Mute';
            c2c_muteButton.setAttribute('title', 'Mute Microphone');
        }
    }
}

function c2c_holdToggle() {
    if (c2c_activeCall) {
        let isOnHold = c2c_activeCall.isLocalHold();
        c2c_ac_log(`Toggling hold: currently ${isOnHold ? 'on hold' : 'active'}`);
        
        // Toggle hold state - hold() method toggles the state
        c2c_activeCall.hold(!isOnHold)
            .then(() => {
                c2c_ac_log(`Hold state changed successfully`);
                // Update button state after successful hold operation
                c2c_updateHoldButtonState();
            })
            .catch((error) => {
                c2c_ac_log('Hold operation failed:', error);
            });
    }
}

function c2c_updateHoldButtonState() {
    if (c2c_activeCall && c2c_holdButton) {
        let isOnHold = c2c_activeCall.isLocalHold();
        
        if (isOnHold) {
            c2c_holdButton.setAttribute('appearance', 'info');
            c2c_holdButton.setAttribute('icon', 'play');
            c2c_holdButton.textContent = 'Resume';
            c2c_holdButton.setAttribute('title', 'Resume Call');
        } else {
            c2c_holdButton.setAttribute('appearance', 'neutral');
            c2c_holdButton.setAttribute('icon', 'pause');
            c2c_holdButton.textContent = 'Hold';
            c2c_holdButton.setAttribute('title', 'Hold Call');
        }
    }
}

function c2c_gui_phoneDisabled(msg) {
    c2c_ac_log(msg);
    c2c_callButton.disabled = true;
    
    // Handle both button types
    let startCallBtn = document.getElementById('start-call-btn');
    let endCallBtn = document.getElementById('c2c_call_btn');
    if (startCallBtn) startCallBtn.disabled = true;
    if (endCallBtn) endCallBtn.disabled = true;
    
    c2c_widgetDiv.className = 'c2c_widget_disabled';
    if (c2c_config.testCallEnabled) {
        c2c_testButton.disabled = true;
    }
}

function c2c_gui_phoneBeforeCall() {
    // Show optional form, if used
    // document.getElementById('user_order').style.display = 'block';
    
    // Stop any existing call timer
    c2c_stopCallTimer();

    // Remove call-active class to show service details
    let supportCard = document.querySelector('mc-card#support-card');
    if (supportCard) {
        supportCard.classList.remove('call-active');
        // Restore the heading when call ends
        supportCard.setAttribute('heading', 'Need assistance with shipping in Croatia?');
    }
    
    // Restore actions slot to DOM after call
    c2c_restoreActionsSlot();

    if (c2c_connectionSpeedDiv && navigator.connection) {
        c2c_connectionSpeedDiv.style.display = 'block';
    }

    if (c2c_testCallQualityDiv) {
        c2c_testCallQualityDiv.style.display = 'block';
    }

    // Show select devices button
    if (c2c_config.selectDevicesEnabled) {
        c2c_selectDevicesButton.style.display = 'inline-block';
        c2c_selectDevicesButton.disabled = false;
        c2c_selectDevicesDiv.style.display = 'none';
    }

    // Show test call button
    if (c2c_config.testCallEnabled) {
        c2c_testButton.style.display = 'inline-block';
        c2c_testButton.disabled = false;
    }

    // Show call button - handle both start-call-btn and c2c_call_btn
    let startCallBtn = document.getElementById('start-call-btn');
    let endCallBtn = document.getElementById('c2c_call_btn');
    
    if (startCallBtn) {
        startCallBtn.style.display = 'inline-block';
        startCallBtn.disabled = false;
        c2c_callButton = startCallBtn;
    }
    
    if (endCallBtn) {
        endCallBtn.style.display = 'none'; // Hide end call button during before call state
    }
    
    // Show pre-call section and hide call-in-progress section
    let preCallSection = document.getElementById('pre-call-section');
    let callInProgress = document.getElementById('call-in-progress');
    if (preCallSection) preCallSection.style.display = 'block';
    if (callInProgress) callInProgress.style.display = 'none';
    
    c2c_callButton.disabled = false;
    c2c_callButton.title = c2c_callButtonTitle;
    // Call button handler
    c2c_callButtonHandler = function () { c2c_call(true); }

    // Show audio/video checkbox
    if (c2c_videoSpan) {
        let showVideoCheckbox = c2c_config.type === 'user_control' && c2c_hasCamera;
        c2c_videoSpan.style.display = showVideoCheckbox ? 'inline-block' : 'none';

        if (c2c_videoCheckbox) {
            c2c_videoCheckbox.checked = c2c_config.videoCheckboxDefault;
        }
    }

    // Hide camera button
    if (c2c_cameraButton) {
        c2c_cameraButton.style.display = 'none';
        if (c2c_cameraLineSvg) {
            c2c_cameraButton.style.display = 'none';
        }
    }

    // Hide keypad and keypad button before call.
    if (c2c_keypadButton) {
        c2c_keypadButton.style.display = 'none';
    }
    if (c2c_keypadDiv) {
        c2c_keypadDiv.style.display = 'none';
    }

    // Hide mute button before call
    if (c2c_muteButton) {
        c2c_muteButton.style.display = 'none';
    }

    // Hide hold button before call
    if (c2c_holdButton) {
        c2c_holdButton.style.display = 'none';
    }

    // Hide show yourself checkbox
    if (c2c_selfVideoSpan) {
        c2c_selfVideoSpan.style.display = 'none';
    }
}

function c2c_gui_DeviceSelection() {
    // Show select devices DIV
    c2c_selectDevicesDiv.style.display = 'block';

    // Hide not used GUI elements
    if (c2c_connectionSpeedDiv) {
        c2c_connectionSpeedDiv.style.display = 'none';
    }
    c2c_selectDevicesButton.style.display = 'none';
    if (c2c_testButton) {
        c2c_testButton.style.display = 'none';
    }
    // Hide both call buttons during device selection
    let startCallBtn = document.getElementById('start-call-btn');
    let endCallBtn = document.getElementById('c2c_call_btn');
    if (startCallBtn) startCallBtn.style.display = 'none';
    if (endCallBtn) endCallBtn.style.display = 'none';
    if (c2c_videoSpan) {
        c2c_videoSpan.style.display = 'none';
    }
    if (c2c_cameraButton) {
        c2c_cameraButton.style.display = 'none';
        if (c2c_cameraLineSvg) {
            c2c_cameraButton.style.display = 'none';
        }
    }
}

function c2c_gui_phoneCalling() {

    // Add call-active class to hide service details
    let supportCard = document.querySelector('mc-card#support-card');
    if (supportCard) {
        supportCard.classList.add('call-active');
        // Hide the heading during call
        supportCard.setAttribute('heading', '');
    }
    
    // Remove actions slot from DOM during call
    c2c_removeActionsSlot();
    
    // Update call status tag to show connecting
    let callStatusTag = document.getElementById('call-status-tag');
    if (callStatusTag) {
        callStatusTag.textContent = 'Connecting...';
        callStatusTag.setAttribute('appearance', 'info');
    }

    // Hide select devices button
    if (c2c_selectDevicesButton) {
        c2c_selectDevicesButton.style.display = 'none';
    }

    if (c2c_isRegularCall) { // Is regular or test call ?
        // Hide connection speed
        if (c2c_connectionSpeedDiv) {
            c2c_connectionSpeedDiv.style.display = 'none';
        }

        // Disable test button if shown.
        if (c2c_config.testCallEnabled) {
            c2c_testButton.disabled = true;
            c2c_testButton.style.display = 'none';
        }

        // Switch to end call button and hide start call button
        let startCallBtn = document.getElementById('start-call-btn');
        let endCallBtn = document.getElementById('c2c_call_btn');
        let preCallSection = document.getElementById('pre-call-section');
        let callInProgress = document.getElementById('call-in-progress');
        
        if (startCallBtn) startCallBtn.style.display = 'none';
        if (preCallSection) preCallSection.style.display = 'none';
        if (callInProgress) callInProgress.style.display = 'block';
        
        if (endCallBtn) {
            endCallBtn.style.display = 'inline-block';
            c2c_callButton = endCallBtn;
        }
        
        // Set the button handler to hangup.
        c2c_callButtonHandler = c2c_hangupCall;

        // Hide video check box span
        if (c2c_videoSpan) {
            c2c_videoSpan.style.display = 'none';
        }
        
        // Hide keypad during calling state (will be shown when call is established)
        if (c2c_keypadDiv) {
            c2c_keypadDiv.style.display = 'none';
        }
    } else {
        // Clear previous value of call quality
        if (c2c_testCallQualityDiv) {
            c2c_testCallQualityDiv.innerHTML = '';
        }

        // Hide call buttons during test call
        let startCallBtn = document.getElementById('start-call-btn');
        let endCallBtn = document.getElementById('c2c_call_btn');
        if (startCallBtn) startCallBtn.style.display = 'none';
        if (endCallBtn) endCallBtn.style.display = 'none';

        // Hide video check box span
        if (c2c_videoSpan) {
            c2c_videoSpan.style.display = 'none';
        }
    }
}

function c2c_gui_phoneOnRemoteHold() {
    c2c_ac_log('phone on remote hold');
    // TODO: show the state
}

function c2c_gui_phoneDuringCall() {
    if (c2c_isRegularCall) {
        // Update call status tag to show in progress
        let callStatusTag = document.getElementById('call-status-tag');
        if (callStatusTag) {
            callStatusTag.textContent = 'In Progress';
            callStatusTag.setAttribute('appearance', 'success');
        }
        
        if (c2c_videoSpan) {
            c2c_videoSpan.style.display = 'none';
        }
        // Make sure we're using the end call button during the call
        let endCallBtn = document.getElementById('c2c_call_btn');
        if (endCallBtn) {
            c2c_callButton = endCallBtn;
        }

        if (c2c_config.type === 'user_control' && c2c_hasCamera) {
            if (c2c_cameraButton && c2c_cameraLineSvg) {
                c2c_cameraButton.style.display = 'inline-block';
                c2c_cameraButton.title = c2c_activeCall.hasEnabledSendVideo() ? 'turn camera off' : 'turn camera on';
                c2c_cameraLineSvg.setAttribute('class', c2c_activeCall.hasEnabledSendVideo() ? 'c2c_camera_on' : 'c2c_camera_off');
            }
        }

        if (c2c_keypadButton) {
            c2c_keypadButton.style.display = 'inline-block';
        }

        // Show mute button during call and update its state
        if (c2c_muteButton) {
            c2c_muteButton.style.display = 'inline-block';
            c2c_updateMuteButtonState();
        }

        // Show hold button during call and update its state
        if (c2c_holdButton) {
            c2c_holdButton.style.display = 'inline-block';
            c2c_updateHoldButtonState();
        }

        if (c2c_selfVideoSpan && c2c_hasCamera && c2c_activeCall.hasSendVideo()) {
            c2c_selfVideoSpan.style.display = 'inline-block';
        } else {
            c2c_selfVideoSpan.style.display = 'none';
        }
    }
}

// Start phone.
c2c_init();

/*
  The optional function c2c_create_x_header() 
  Please comment if not used.

  It allows fill some arbitrary HTML form before call
  and send collected data as SIP INVITE X-Header.  
  Web Designer should modify the code according used HTML form.

function c2c_create_x_header() {
    // E.g. used form with 3 required parts.
    let name = document.getElementById('customer_name').value.trim();
    let mobile = document.getElementById('customer_mobile').value.trim();
    let address = document.getElementById('customer_address').value.trim();

    // The function can throw exception.
    // Click-to-call show the exception in status line and not called.
    if( name === '')
      throw 'Missed name';
    if( mobile === '')
      throw 'Missed phone number';
    if( address === '')
      throw 'Missed address';

    // Note:
    // If form fields are optional and not filled,
    // the function can return null (instead string)
    // In the case click-to-call start call, the x-header is not created.
	
    // Create SIP X header.
    let json = JSON.stringify({name, mobile, address});
    return 'X-Customer-Information: ' + json; 
}
*/

// Remove actions slot from DOM during call
function c2c_removeActionsSlot() {
    if (!c2c_actionsSlot) {
        c2c_actionsSlot = document.querySelector('[slot="actions"]');
        if (c2c_actionsSlot) {
            c2c_actionsParent = c2c_actionsSlot.parentNode;
        }
    }
    
    if (c2c_actionsSlot && c2c_actionsParent && c2c_actionsSlot.parentNode) {
        c2c_actionsSlot.remove();
    }
}

// Restore actions slot to DOM after call
function c2c_restoreActionsSlot() {
    if (c2c_actionsSlot && c2c_actionsParent && !c2c_actionsSlot.parentNode) {
        c2c_actionsParent.appendChild(c2c_actionsSlot);
    }
}
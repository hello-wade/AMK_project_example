const gpio = require('rpi-gpio');
const record = require('node-record-lpcm16');
const aikit = require('./aimakerskitutil');
const Speaker = require('speaker');

// 스피커의 초기값을 넣어줍니다.
const fs = require('fs');
const soundBuffer = fs.readFileSync('../data/sample_sound.wav'); //'띠리링' 소리의 파일을 지정해 줍니다.
const pcmplay = new Speaker({
	channels: 1,
	bitDepth: 16,
	sampleRate: 16000
});

// 마이크의 초기 값을 넣어 줍니다.
function initMic() {
    return record.start({
            sampleRateHertz: 16000,
            threshold: 0,
            verbose: false,
            recordProgram: 'arecord',
    })
};

// Node.js의 버전을 확인해줍니다.
const nodeVersion = process.version.split('.')[0];
let ktkws=null;

if(nodeVersion === 'v6') ktkws = require('./ktkws');
else if(nodeVersion === 'v8') ktkws = require('./ktkws_v8');

gpio.setup(31, gpio.DIR_LOW, write); // GPIO(버튼 LED)를 출력 모드로 설정합니다.

function write(err) {
	if(err) console.log('write Error:'+err);
};


const json_path = '/home/pi/Downloads/clientKey.json'; // 개발자 콘솔에서 다운로드 받은 clinetKey.json의 경로를 적어 줍니다.
const cert_path = '../data/ca-bundle.pem';
const proto_path = '../data/gigagenieRPC.proto';

const kwstext = ['기가지니','지니야','친구야','자기야'];
const kwsflag = parseInt(process.argv[2]);


ktkws.initialize('../data/kwsmodel.pack');
ktkws.startKws(kwsflag);
let mic = initMic();

aikit.initializeJson(json_path, cert_path, proto_path); // aimakerskitutil 모듈을 사용자의 키값으로 초기화해줍니다.

let mode = 0;// mode가 0일 때에는 호출어 인식 모드를 실행하고 1일 때에는 음성인식모드로 실행한다.
let ktstt = null;
mic.on('data', (data) => {
	if(mode === 0) {
		result = ktkws.pushBuffer(data); // 마이크의 음성 데이터를 호출어 인식 모듈에 인력한다.
		if(result === 1) { // 호출어가 인식되었을 떄 '띠리링'소리를 출력하고 1초 후에 음성인식을 시작한다.
			console.log("KWS Detected"); 
			pcmplay.write(soundBuffer);
			setTimeout(startStt, 1000);
		}
	} else {
        ktstt.write({audioContent: data}); // 마이크의 음성데이터를 음성인식 모듈에 입력한다.
	}
});

console.log('say :' + kwstext[kwsflag]);

function startStt() {
	ktstt = aikit.getVoice2Text();
	ktstt.on('error',(error) => {
	    console.log('Error:'+error);
	});
	ktstt.on('data', (data) => { // 음성을 텍스트로 변환한 값을 받아서 처리한다.
        console.log('stt result:' + JSON.stringify(data));

        if (data.resultCd === 201) { //음성인식이 완료 되었을 때
            controlLed(data, function(result) { // 음성명령결과에 따라서 LED를 제어한 후 결과 값으로 음성을 출력해줍니다.
                let responseString = ""; // 음성 출력할 문자를 저장하는 변수입니다.

                // 결과에 따른 출력을 설정합니다.
                if (result === 1) {
                    responseString = '불을 켭니다.';
                } else if (result === 2) {
                    responseString = '불을 끕니다.';
                } else {
                    responseString = '정확한 명령을 내려주세요.';
                }

                playTTS(responseString, () => { // LED를 제어한 후에 받은 결과 값을 받아서 음성 출력을 해줍니다.
                    mode = 0; //모든 처리가 완료되면 mode를 0으로 만들어서 호출어 인식 모드로 전환합니다.
                });
            });
        }

		if(data.resultCd !== 200 && data.resultCd !== 201) mode = 0;
    });

    // 음성인식이 끝나면 실행됩니다.
	ktstt.on('end',() => {
		console.log('stt text stream end');
    });
    
	ktstt.write({reqOptions: {mode: 0, lang: 0}});
	mode=1; // mode 변수에 1을 입력하고 음성인식 모드로 전환합니다.
};

// 음성명령에 따라서 LED를 제어하는 함수 입니다.
function controlLed (data, callback){
    resultText = data.recognizedText;
    if (resultText.search("불 켜") >= 0){
        gpio.write(31, true);
        callback(1);
    }

    else if(resultText.search("불 꺼") >= 0){
        gpio.write(31, false);
        callback(2);

    }
    else {
        callback(0);
    }
}

// 결과 값을 받아서 음성으로 출력해주는 함수 입니다.
function playTTS (returnVoice, callback) {

    kttts = aikit.getText2VoiceStream({text: returnVoice, lang: 0, mode: 0});

    kttts.on('error', (error) => {
        console.log('Error:'+error);
    });
    kttts.on('data', (data) => {
        if (data.streamingResponse === 'resOptions' && data.resOptions.resultCd === 200){
            console.log('Stream send. format:'+data.resOptions.format);
        }

        if (data.streamingResponse ==='audioContent') {
            pcmplay.write(data.audioContent);
        } else {
            console.log('msg received:'+JSON.stringify(data));
        }
    });

    kttts.on('end', () => {
        console.log('pcm end');
    });

    setTimeout(() => {
        console.log('tts played');
        callback();
    }, 800);

}
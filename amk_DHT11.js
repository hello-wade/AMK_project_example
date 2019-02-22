const gpio = require('rpi-gpio');
const record = require('node-record-lpcm16');
const aikit = require('./aimakerskitutil');
const Speaker = require('speaker');
var sensor = require('node-dht-sensor');

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
            checkCommand(data, function(result) { // 음성 명령 결과를 저장해주고 저장한 값에 따른 출력을 해줍니다.
                let responseString = ""; // 음성 출력할 문자를 저장하는 변수입니다.
                readSensor(11, 3, (err, temperature, humidity) => { //DHT11을 사용하고 BCM3번 핀에서 데이터를 받습니다.
                    // 결과에 따른 출력을 설정합니다.
                    if(!err){
                        if (result === 1) {
                            responseString = '현재 온도는' + temperature + '도 입니다.';
                        } else if (result === 2) {
                            responseString = '현재 습도는' + humidity + '퍼센트 입니다.';
                        } else {
                            responseString = '정확한 명령을 내려주세요.';
                        }

                        playTTS(responseString, () => { // 온도 또는 습도의 값을 음성 출력 해줍니다.
                            mode = 0; //모든 처리가 완료되면 mode를 0으로 만들어서 호출어 인식 모드로 전환합니다.
                        });

                    } else{
                        console.log("온도센서 초기화 에러")
                    }
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

// 어떤 음성명령이 입력되는지 확인하는 함수 입니다.
function checkCommand (data, callback){
    resultText = data.recognizedText;
    if (resultText.search("온도 알려줘") >= 0){
        callback(1);
    } else if(resultText.search("습도 알려줘") >= 0){
        callback(2);
    } else {
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

// 온도와 습도값을 측정해서 리턴해주는 함수 입니다.
function readSensor(DHT_VER, DHT_GPIO, callback) {
    sensor.read(DHT_VER, DHT_GPIO, function(err, temperature, humidity) {
        if (!err) {
            console.log('temp: ' + temperature.toFixed(1) + '°C, ' +
                'humidity: ' + humidity.toFixed(1) + '%'
            );
            callback(err, temperature, humidity);
        }
    });
}
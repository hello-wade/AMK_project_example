const record = require('node-record-lpcm16');
const aikit = require('./aimakerskitutil');
const fs = require('fs');
const Speaker = require('speaker');

let ktkws = null;
const nodeVersion = process.version.split('.')[0];
if(nodeVersion === 'v6') ktkws = require('./ktkws');
else if(nodeVersion === 'v8') ktkws = require('./ktkws_v8');

const request = require('request');

const json_path = '/home/pi/Downloads/clientKey.json';
const cert_path = '../data/ca-bundle.pem';
const proto_path = '../data/gigagenieRPC.proto';

const kwstext = ['기가지니', '지니야', '친구야', '자기야'];
const kwsflag = parseInt(process.argv[2]);

const soundBuffer = fs.readFileSync('../data/sample_sound.wav');
const pcmplay = new Speaker({
  channels: 1,
  bitDepth: 16,
  sampleRate: 16000
});

function initMic() {
  return record.start({
      sampleRateHertz: 16000,
      threshold: 0,
      verbose: false,
      recordProgram: 'arecord'
  });
};

ktkws.initialize('../data/kwsmodel.pack');
ktkws.startKws(kwsflag);
let mic = initMic();

aikit.initializeJson(json_path, cert_path, proto_path);

let mode = 0;   // 0 : kws, 1 : stt
let ktstt = null;
let player = null;
mic.on('data', (data) => {
  if(mode === 0) {
    result = ktkws.pushBuffer(data);
    if(result === 1) {
      console.log("KWS Detected");
      pcmplay.write(soundBuffer);
      setTimeout(startSTT, 1000);
    }
  } else {    
    ktstt.write({audioContent: data});
    if(player != null) {
      player.stop();
    }
  }
});

function startTTS(text, speaker) {
  let kttts = aikit.getText2VoiceStream({text: text, lang: 0, mode: 0});
  
  kttts.on('error', (error) => console.log('Error:' + error));
  kttts.on('data', (data) => {
    if (data.streamingResponse === 'resOptions' && data.resOptions.resultCd === 200) {
        console.log('Stream send. format:' + data.resOptions.format);
    }

    if (data.streamingResponse === 'audioContent') {
        speaker.write(data.audioContent);
    } else {
        console.log('msg received:' + JSON.stringify(data));
    }
  });
  kttts.on('end', () => console.log('pcm end'));
}

console.log('say :' + kwstext[kwsflag]);
function startSTT() {
  ktstt = aikit.getVoice2Text();
  ktstt.on('error', (error) => console.log('Error:' + error));
  ktstt.on('data', async (data) => {
    console.log('stt result:' + JSON.stringify(data));
    if (data.resultCd === 201) {
      const recognizedText = data.recognizedText;

      if (recognizedText.includes('노래') && 
         (recognizedText.includes('틀어줘') || recognizedText.includes('들려줘'))) {
        let target = recognizedText.split('노래')[0];
        console.log('Play Target:' + target);

        const ttsComment = '유튜브의 ' + target + ' 노래를 플레이합니다';
        startTTS(ttsComment, pcmplay);

        player = new YoutubePlayer(await getYoutubeUrl(target), pcmplay);
        player.play();
      } else if(recognizedText.includes('노래 꺼줘')) {
        if (player != null) {
          player.stop();
          player = null;

          const ttsComment = '노래를 정지합니다.';
          startTTS(ttsComment, pcmplay);
        }
      } else {
        if (player != null) {
          player.play();
        }
      }
      mode = 0;
    }
  });
  ktstt.on('end', () => {
    console.log('stt text stream end');
    mode = 0;
  });
  ktstt.write({reqOptions: {mode: 0, lang: 0}});
  mode = 1;
};

async function getYoutubeUrl(keyword) {
  const youtubePlayBaseUrl = 'https://www.youtube.com/watch?';
  let urls = await getYoutubeSearchList(keyword);
  let targetUrl = youtubePlayBaseUrl + urls[0];
  console.log('yt url:' + targetUrl);

  return targetUrl;
}

function getYoutubeSearchList(target) {
  const queryText = target;

  return new Promise((resolve, reject) => {
    console.log('QueryText: ' + queryText);
    const searchurl = 'https://www.youtube.com/results?search_query=';
    const queryUrl = encodeURI(searchurl + queryText);
    request(queryUrl, (err, res, body) => {
      let splitByWatch = body.split('href=\"\/watch?');
      let isFirst = true;
      let urlList = [];
      splitByWatch.forEach((splitText) => {
        if (isFirst === true) {
          isFirst = false;
        } else {
          let splitByQuot = splitText.split('"');
          urlList.push(splitByQuot[0]);
        }
      });
      resolve(urlList);
    });
  });
}

const getYoutubeStream = require('youtube-audio-stream');
const ffmpeg = require('fluent-ffmpeg');

class YoutubePlayer {
  constructor(url, speaker) {
    this.url = url;
    this.status = 'stop';
    this.stream = this._initStream();
    this.speaker = speaker;
  }

  _initStream() {
    var ffstream = ffmpeg({source: getYoutubeStream(this.url)})
      .inputFormat('mp3')
      .format('wav')
      .outputOptions([
          '-b:a 332k',
          '-ar 16000',
          '-ab 64',
          '-ac 1',
      ]).pipe();

    return ffstream;
  }
  
  play () {
    if(this.status === 'stop') {
      this.stream.pipe(this.speaker);
      this.status = 'play';
    }
  }

  stop () {
    if(this.status === 'play') {
      this.stream.unpipe();
      this.status = 'stop';
    }
  } 
}
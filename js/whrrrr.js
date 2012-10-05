// figure out amplitude & pitch detection

var fftSize = Math.pow(2, 13); // 8092 - fft input is a power of two.
var bufferFillSize = Math.pow(2, 11) // fftSize / 4 = 2048, size of our cycle.

var forReal = true;

// define filters
var context = new webkitAudioContext();

var gauss = new WindowFunction(DSP.GAUSS);

var lp = context.createBiquadFilter();
lp.type = lp.LOWPASS;
lp.frequency = 8000;
lp.Q = 0.1;

var hp = context.createBiquadFilter();
hp.type = hp.HIGHPASS;
hp.frequency = 20;
hp.Q = 0.1;

// fft
var fft = new FFT(fftSize, context.sampleRate / 4);

function makeItGo() {
  console.log("Going!");
navigator.webkitGetUserMedia({ audio : true }, function success(stream) {
  var streamSource = context.createMediaStreamSource(stream);
  var buffer = initBuffer(fftSize);

  bufferFiller = context.createJavaScriptNode(bufferFillSize, 1, 1);
  bufferFiller.onaudioprocess = function fillBuffer(e) {
    var input = e.inputBuffer.getChannelData(0);
    buffer = fill(buffer, input);
  };

  // wire filters
  // streamSource.connect(bufferFiller);

  streamSource.connect(lp);
  lp.connect(hp);
  hp.connect(bufferFiller);

  // pitch - can do!
  bufferFiller.connect(context.destination);

  var noiseCount = 0;
  var noiseThreshold = -Infinity;
  var maxPeaks = 0;
  var maxPeakCount = 0;
  function whrrr() {

    var bfrcpy = buffer.slice(0);
    gauss.process(bfrcpy);

    // blindly following http://phenomnomnominal.github.com/docs/tuner.html,
    // but not in coffeescript.
    fft.forward(bfrcpy.map(function dwnsmpl(e, i) { return i % 4 ? 0 : e }));

    // take noise floor
    if (noiseCount < 10) {
      noiseThreshold = _.reduce(fft.spectrum, function (acc, e) {
        return e > acc ? e : acc;
      }, noiseThreshold);
      noiseThreshold = noiseThreshold > 0.001 ? 0.001 : noiseThreshold;
      noiseCount++;
      // console.log("noiseThreshold: ", noiseThreshold, " at sample ", noiseCount);
    }

    var spectrumPoints = [];
    for (var x = 0; x < fft.spectrum.length / 4; x++) {
      spectrumPoints.push({ x : x, y : fft.spectrum[x] });
    }
    spectrumPoints.sort(function(a, b) { return b.y - a.y});

    var peaks = [];
    for (var i = 0; i < 8; i++) {
      if (spectrumPoints[i].y > noiseThreshold * 5)
        peaks[i] = spectrumPoints[i];
    }

    if (peaks.length > 0) {
      // console.log("Found peaks");

      // reduce peaks.
      for (var i = 0; i < peaks.length; i++) {
        if (peaks[i]) {
          for (var j = 0; j < peaks.length; j++) {
            if (i != j && peaks[j] && Math.abs(peaks[i].x - peaks[j].x) < 5) {
              peaks[j] = null;
            }
          }
        }
      }

      peaks = peaks.filter(function(p) { return p ? true : false }).sort(function(a, b) { return a.x - b.x });

      maxPeaks = maxPeaks < peaks.length ? maxPeaks : peaks.length;

      var peak, firstFreq, secondFreq, thirdFreq;


      firstFreq = peaks[0].x * (context.sampleRate / fftSize);
      if (peaks.length > 1) {
        secondFreq = peaks[1].x * (context.sampleRate / fftSize);
        if (1.4 < firstFreq/secondFreq && firstFreq/secondFreq < 1.6)
          peak = peaks[1];
      }
      if (peaks.length > 2) {
        thirdFreq = peaks[2].x * (context.sampleRate / fftSize)
        if (1.4 < firstFreq/thirdFreq && firFreq/thirdFreq < 1.6)
          peak = peaks[2];
      }
      if (peaks.length > 1 || maxPeaks == 1) {
        // if not peak?
        //       peak = peaks[0]

        if (!peak) peak = peaks[0];
        var left = {
          x : peak.x - 1,
          y : Math.log(fft.spectrum[peak.x - 1])
        };
        _peak = {
          x : peak.x,
          y : Math.log(fft.spectrum[peak.x])
        };
        var right = {
          x : peak.x + 1,
          y : Math.log(fft.spectrum[peak.x + 1])
        };

        //     interp = (0.5 * ((left.y - right.y) / (left.y - (2 * peak.y) + right.y)) + peak.x)
        //     freq = interp * (sampleRate / fftSize)
        var interp = (0.5 * ((left.y - right.y) / (left.y - (2 * peak.y) + right.y)) + peak.x);
        var freq = interp * (context.sampleRate / fftSize);
        //     [note, diff] = getPitch freq

        var note = getPitch(freq);

        //     display.draw note, diff
        // forward?
        move(freq, note);
      }

    } else {
      maxPeaks = 0;
      maxPeakCount++;
      // hover?
      hover();
    }
  }

  setInterval(whrrr, 100);
});
}



var moving = false;
var freqRange = [];
var lastSecond = 0;

function move(freq, note) {
  // start
  if (socket) {
    freqRange.push(freq);
    if (!moving) {
      moving = true;
      if (forReal) {
        socket.emit('command', { "start" : 0.5 });
        console.log('starting');
      } else {

      }
      freqRange = [];
      // commands up, down, by frequency.
      // frequency range.
    }
    if (moving) {
      var thisSecond = freqRange.slice(-20).reduce(function(acc, e, i, c) {
        return acc += e
      }, 0) / 20;
      if (thisSecond > lastSecond) {

        socket.emit('up', 0.5);
        console.log("up");
      } else {
        socket.emit('down', 0.5);
        console.log("down");
      }
      lastSecond = thisSecond;
    }
  } else {
    // console.log("Waiting on socket.")
  }
}

function hover() {
  // stop
  // console.log("Hovering.");
  if (socket) {
    // console.log("stopping");
    if (moving) {
      moving = false;
      if (forReal) {
        socket.emit('command', { "stop" : 1 });
        console.log('stopping');
      } else {

      }
    }
  } else {
    // console.log("Waiting on socket.");
  }
}

var frequencies = {
    'A0': 27.5,
    'A1': 55,
    'A2': 110,
    'A3': 220,
    'A4': 440,
    'A5': 880,
    'A6': 1760,
    'A7': 3520.00,
    'A#0': 29.1352,
    'A#1': 58.2705,
    'A#2': 116.541,
    'A#3': 233.082,
    'A#4': 466.164,
    'A#5': 932.328,
    'A#6': 1864.66,
    'A#7': 3729.31,
    'B0': 30.8677,
    'B1': 61.7354,
    'B2': 123.471,
    'B3': 246.942,
    'B4': 493.883,
    'B5': 987.767,
    'B6': 1975.53,
    'B7': 3951.07,
    'C1': 32.7032,
    'C2': 65.4064,
    'C3': 130.813,
    'C4': 261.626,
    'C5': 523.251,
    'C6': 1046.50,
    'C7': 2093,
    'C8': 4186.01,
    'C#1': 34.6478,
    'C#2': 69.2957,
    'C#3': 138.591,
    'C#4': 277.183,
    'C#5': 554.365,
    'C#6': 1108.73,
    'C#7': 2217.46,
    'D1': 36.7081,
    'D2': 73.4162,
    'D3': 146.832,
    'D4': 293.665,
    'D5': 587.330,
    'D6': 1174.66,
    'D7': 2349.32,
    'D#1': 38.8909,
    'D#2': 77.7817,
    'D#3': 155.563,
    'D#4': 311.127,
    'D#5': 622.254,
    'D#6': 1244.51,
    'D#7': 2489.02,
    'E1': 41.2034,
    'E2': 82.4069,
    'E3': 164.814,
    'E4': 329.628,
    'E5': 659.255,
    'E6': 1318.51,
    'E7': 2637.02,
    'F1': 43.6563,
    'F2': 87.3071,
    'F3': 174.614,
    'F4': 349.228,
    'F5': 698.456,
    'F6': 1396.91,
    'F7': 2793.83,
    'F#1': 46.2493,
    'F#2': 92.4986,
    'F#3': 184.997,
    'F#4': 369.994,
    'F#5': 739.989,
    'F#6': 1479.98,
    'F#7': 2959.96,
    'G1': 48.9994,
    'G2': 97.9989,
    'G3': 195.998,
    'G4': 391.995,
    'G5': 783.991,
    'G6': 1567.98,
    'G7': 3135.96,
    'G#1': 51.9131,
    'G#': 103.826,
    'G#3': 207.652,
    'G#4': 415.305,
    'G#5': 830.609,
    'G#6': 1661.22,
    'G#7': 3322.44
  };

function getPitch(freq) {
// getPitch = (freq) ->
//       minDiff = Infinity
//       diff = Infinity
//       for own key, val of frequencies
//         if Math.abs(freq - val) < minDiff
//           minDiff = Math.abs(freq - val)
//           diff = freq - val
//           note = key
//       [note, diff]
  var minDiff = Infinity;
  var diff = Infinity;
  return Object.keys(frequencies).reduce(function(acc, key) {
    var val = frequencies[key];
    if (Math.abs(freq - val) < minDiff) {
      minDiff = Math.abs(freq - val);
      diff = freq = val;
      note = key;
    }
    return {
      note : note,
      diff : diff
    }
  });
}

// create the circ buffer, init to 0.
function initBuffer(fftSize) {
  var bfr = [];
  for (var i = 0; i < fftSize; i++) {
    bfr.push(0);
  }
  return bfr;
}

function fill(bfr, data) {
  bfr = bfr.slice(bufferFillSize);
  for (var i = 0; i < data.length; i++) {
    bfr.push(data[i]);
  }
  return bfr;
}


connectSocket();
makeItGo();


// each sample, get amplitude

// each sample, get freq


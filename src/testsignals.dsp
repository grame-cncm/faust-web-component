declare name "Test signals";
import("stdfaust.lib");

// Test signals for the inputs of <faust-editor> and <faust-widget>.
// The component lists the entries of the "signal" menu in its input selector
// and shows the other controls in its Input panel: a new signal is a new entry
// of the menu and of the selectn below.
process = ba.selectn(10, signal,
    impulse,              // 0 impulse
    no.noise,             // 1 white noise
    no.pink_noise,        // 2 pink noise
    os.osc(freq),         // 3 sine
    sweep,                // 4 sweep
    os.square(freq),      // 5 square (band limited)
    os.sawtooth(freq),    // 6 sawtooth (band limited)
    os.lf_imptrain(freq), // 7 pulse train
    step,                 // 8 step
    burst                 // 9 tone burst
) * level
with {
    signal  = nentry("signal [style:menu{'impulse':0;'white noise':1;'pink noise':2;'sine':3;'sweep':4;'square':5;'sawtooth':6;'pulse train':7;'step':8;'tone burst':9}]", 0, 0, 9, 1);
    level   = hslider("[0]level [unit:dB]", -12, -60, 0, 0.1) : ba.db2linear;
    freq    = hslider("[1]freq [unit:Hz] [scale:log]", 440, 20, 20000, 1);
    period  = hslider("[2]period [unit:s]", 1, 0.05, 10, 0.01);
    restart = button("[3]restart");

    // Samples since the start of the period; back to 0 at time 0, when the signal
    // changes and when restart is pressed, so that an impulse or a sweep starts at once
    n     = ba.sec2samp(period);
    reset = (1 - 1') | (signal != signal') | ba.impulsify(restart);
    count = \(c).(select2(reset, (c + 1) % n, 0)) ~ _;
    cycle = count / n;                                // 0..1 once per period

    impulse = count == 0;                             // one sample at 1 per period
    sweep   = os.osc(20 * pow(1000, cycle));          // log sweep 20 Hz -> 20 kHz over period
    step    = cycle < 0.5;                            // 1 then 0, half a period each
    burst   = os.osc(freq) * (cycle < 0.1);           // sine during the first tenth
};

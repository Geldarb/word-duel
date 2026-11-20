import { io } from 'socket.io-client';

const URL = process.env.LIVE_URL || process.env.URL || 'http://127.0.0.1:3000';
const TEST_SECRET = process.env.TEST_SECRET || '';
const TURN_SECONDS = Number(process.env.TEST_TURN_SECONDS || 0) || undefined;

const COMMON = `
aa ab ad ae ag ah ai al am an ar as at aw ax ay ba be bi bo by
de do ed ef eh el em en er es et ex fa fe go ha he hi hm ho id
if in is it jo ka ki la li lo ma me mi mo mu my na ne no nu od
oe of oh oi om on op or os ow ox oy pa pe pi po qi re sh si so
ta te ti to uh um un up us ut we wo xi ye yo
ace act add age ago aid ail aim air ale all alp and ant any ape
apt arc are ark arm art ash ask asp ate awe awk awk
bad bag bah ban bap bar bat bay bed bee beg bet bid big bin bit
boa bob bog boo bop bot bow box boy bra bud bug bum bun bus but
buy cab cad cam can cap car cat caw cay cob cod cog con coo cop
cot cow cox coy cry cub cud cue cup cur cut dab dad dam dan dap
day den dew did die dig dim din dip doc doe dog don dot dry dub
dud due dug dun duo dye ear eat eau eek eel egg ego eke elf elk
elm emu end eon era ere err eve ewe eye fad fag fan far fat fax
fay fed fee fen few fey fez fib fid fie fig fin fir fit fix flu
fly fob foe fog fop for fox fro fry fun fur gab gad gag gal gap
gas gat gay ged gee gel gem get ghi gib gid gig gin git gnu gob
god goo got gum gun gut guy gym had hag hah ham hap has hat haw
hay hem hen hep her het hew hex hey hic hid him hip his hit hob
hod hoe hog hop hot how hub hue hug huh hum hun hut ice icy iff
ilk ill imp ink inn ion ire irk ivy jab jag jam jar jaw jay jet
jib jig job jog jot joy jug jut kea keb keg ken key kid kin kip
kit koa kop lab lac lad lag lam lap law lax lay lea led leg lei
lek let leu lev lex ley lid lie lip lis lit lob log loo lop lot
low lox lug lye mac mad mae mag man map mar mas mat maw max may
med meg mel mem men met mew mid mig mil mir mix moa mob moc mod
mog moo mop mow mud mug mum mun mus mut nab nae nag nah nam nan
nap nay neb nee net new nib nil nim nip nit nix nob nod nog nor
not now nth nub nun nut oaf oak oar oat oba obe obi oca odd ode
oik oil oka oke old ole one ono ons ooh oot ope ora orb orc ore
ors ort ose oud our out ova owe owl own pac pad pal pam pan pap
par pas pat paw pax pay pea pec ped pee peg pen pep per pes pet
pew pic pie pig pin pip pis pit piu pix ply pod poh poi pol pom
poo pop pot pow pox pro pry psi pub pud pug pul pun pup pur pus
put pya qat rad rag rah rai raj ram ran rap ras rat raw rax ray
reb rec red ree ref reg rei rem rep res ret rev rex rho ria rib
rid rif rig rim rin rip rob roc rod roe rom roo rot row rub rue
rug rum run rut rya rye sab sac sad sae sag sal sap sat sau saw
sax say sea sec see seg sei sel sen ser set sew sex she shy sib
sic sim sin sip sir sis sit six ska ski sly sob sod sol son sop
sot sou sow sox soy spa spy sri sty sub sue sum sun sup suq syn
tab tad tae tag taj tam tan tao tap tar tas tat tau tav taw tax
tea ted tee teg tel ten tet tew the tho thy tic tie til tin tip
tis tit tod toe tog tom ton too top tor tot tow toy try tsk tub
tug tui tun tup tut tux twa two tye udo ugh uke ulu ump uns urd
urn use uta uts vac van var vas vat vau vee veg vet vex via vid
vie vig vim vis voe vow vox wad wae wag wan wap war was wat waw
wax way web wed wee wen wet wha who why wig win wis wit wiz woe
wok won woo wop wos wot wow wry wud wye wyn yag yah yak yam yap
yar yaw yay yea yeh yen yep yes yet yew yid yin yip yob yod yok
yom yon you yow yug yuk yum yup zag zap zas zax zed zee zek zel
zen zep zig zin zip zit zoa zod zoo
colour centre honour defence realise cheque
`.trim().split(/\s+/);

function canForm(word, letters) {
  const bag = {};
  for (const L of letters) bag[L] = (bag[L] || 0) + 1;
  for (const ch of word.toUpperCase()) {
    if (!bag[ch]) return false;
    bag[ch]--;
  }
  return true;
}

function findValid(letters) {
  const L = letters.map((c) => c.toUpperCase());
  const sorted = [...COMMON].sort((a, b) => b.length - a.length);
  for (const w of sorted) {
    if (canForm(w, L)) return w.toUpperCase();
  }
  return null;
}

function findInvalid(letters) {
  const L = letters.map((c) => c.toUpperCase());
  const tries = ['QX', 'ZX', 'JJ', 'QQ', 'VX', 'WW', 'KK', 'YY', 'HH', 'FF', 'VV', 'XX', 'ZZ', 'CC', 'BB', 'NN', 'RR', 'LL', 'TT', 'PP', 'DD', 'GG'];
  for (const w of tries) {
    if (canForm(w, L) && !COMMON.includes(w.toLowerCase())) return w;
  }
  for (let i = 0; i < L.length; i++) {
    for (let j = 0; j < L.length; j++) {
      for (let k = 0; k < L.length; k++) {
        if (new Set([i, j, k]).size < 3) continue;
        const w = L[i] + L[j] + L[k];
        if (!COMMON.includes(w.toLowerCase()) && !/^[AEIOU]+$/i.test(w)) return w;
      }
    }
  }
  return 'QX';
}

function connect(name) {
  const socket = io(URL, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 20000,
  });
  socket.name = name;
  socket.state = null;
  socket.on('state', (s) => { socket.state = s; });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${name} connect timeout`)), 45000);
    socket.once('connect', () => { clearTimeout(t); resolve(socket); });
    socket.once('connect_error', (err) => { clearTimeout(t); reject(err); });
  });
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${event} timeout`)), 15000);
    socket.emit(event, payload, (res) => {
      clearTimeout(t);
      if (res?.error) reject(new Error(`${event}: ${res.error}`));
      else resolve(res);
    });
  });
}

function waitFor(socket, pred, label, ms = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (pred(socket.state)) return resolve(socket.state);
      if (Date.now() - start > ms) {
        return reject(new Error(`timeout waiting for ${label} (status=${socket.state?.status})`));
      }
      setTimeout(tick, 40);
    };
    const onState = (s) => {
      socket.state = s;
      if (pred(s)) {
        cleanup();
        resolve(s);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${label} (status=${socket.state?.status})`));
    }, ms);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('state', onState);
    };
    socket.on('state', onState);
    if (socket.state && pred(socket.state)) {
      cleanup();
      resolve(socket.state);
    }
  });
}

async function main() {
  console.log('Live match test against', URL);
  const ada = await connect('Ada');
  const bea = await connect('Bea');
  console.log('connected');

  const created = await emit(ada, 'createRoom', {
    name: 'Ada',
    testSecret: TEST_SECRET || undefined,
    turnSeconds: TURN_SECONDS,
  });
  const code = created.code;
  console.log('room', code, 'turnSeconds later from state');
  await emit(bea, 'joinRoom', { name: 'Bea', code });

  await waitFor(ada, (s) => s && (s.status === 'coin' || s.status === 'playing'), 'coin/play', 10000);
  const playing = await waitFor(ada, (s) => s && s.status === 'playing' && s.current, 'first turn', 8000);
  console.log('first turn', playing.current.letters.join(''), 'secs', playing.turnSeconds);
  const bonus = playing.current.bonus;
  if (!bonus || !['DL', 'DW'].includes(bonus.type) || bonus.index < 0 || bonus.index > 6) {
    throw new Error(`missing or invalid bonus tile: ${JSON.stringify(bonus)}`);
  }
  console.log('bonus', bonus);

  const seen = { valid: 0, invalid: 0, timeout: 0 };
  for (let turn = 1; turn <= 12; turn++) {
    await waitFor(ada, (s) => s?.status === 'playing' && s.current?.turnNumber === turn, `turn ${turn} start`, 10000);
    const st = ada.state;
    const actor = st.current.yours ? ada : bea;
    const letters = st.current.letters;
    let kind;
    if (turn === 1) kind = 'valid';
    else if (turn === 2) kind = 'invalid';
    else if (turn === 3) kind = 'timeout';
    else kind = 'valid';

    if (kind === 'timeout') {
      const waitMs = (st.turnSeconds * 1000) + 4000;
      console.log(`  turn ${turn} timeout wait ${st.turnSeconds}s`);
      await waitFor(ada, (s) => s?.status === 'intermission' && s.lastResult?.reason === 'timeout', `turn ${turn} timeout`, waitMs);
    } else if (kind === 'invalid') {
      const word = findInvalid(letters);
      console.log(`  turn ${turn} invalid ${word} from ${letters.join('')}`);
      await emit(actor, 'submitWord', { word });
      await waitFor(ada, (s) => s?.status === 'intermission' && s.lastResult && s.lastResult.valid === false, `turn ${turn} invalid result`, 8000);
    } else {
      const word = findValid(letters);
      if (!word) throw new Error(`no valid word in ${letters.join('')} on turn ${turn}`);
      console.log(`  turn ${turn} valid ${word} from ${letters.join('')}`);
      const used = [];
      const bag = word.split('');
      letters.forEach((ch, i) => {
        const at = bag.indexOf(ch);
        if (at !== -1) {
          used.push(i);
          bag[at] = null;
        }
      });
      await emit(actor, 'submitWord', { word, tiles: used });
      await waitFor(ada, (s) => s?.status === 'intermission' && s.lastResult?.valid === true && s.lastResult.word === word, `turn ${turn} valid result`, 8000);
      const applied = ada.state.lastResult.bonusApplied;
      const shown = ada.state.lastResult.breakdown;
      if (applied && !shown) throw new Error('bonus applied but no score breakdown');
      console.log('    bonus', ada.state.current?.bonus || ada.state.lastResult.bonus, 'applied', applied);
    }
    const result = ada.state.lastResult;
    seen[result.reason === 'timeout' ? 'timeout' : (result.valid ? 'valid' : 'invalid')] += 1;
    console.log(`    -> ${result.reason} ${result.word || ''} +${result.score} scores ${result.scores.p1}-${result.scores.p2}`);
  }

  const ended = await waitFor(ada, (s) => s?.status === 'ended', 'end screen', 10000);
  const endB = await waitFor(bea, (s) => s?.status === 'ended', 'end screen B', 5000);
  console.log('ended', ended.you.score, 'vs', ended.opponent.score, 'winner title via scores');
  if (!ended.you.history || ended.you.history.length + ended.opponent.history.length !== 12) {
    throw new Error(`expected 12 history entries, got ${ended.you.history?.length} + ${ended.opponent.history?.length}`);
  }
  if (endB.status !== 'ended') throw new Error('Bea did not reach end');
  if (seen.valid < 1 || seen.invalid < 1 || seen.timeout < 1) {
    throw new Error(`missing kind in results: ${JSON.stringify(seen)}`);
  }

  ada.close();
  bea.close();
  console.log('PASS', JSON.stringify(seen));
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});

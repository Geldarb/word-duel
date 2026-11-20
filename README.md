# Word Duel

A cosy real-time 1v1 word game for two phones. One of you creates a room, the
other joins with a short code, and you take turns making a word from a fresh
seven-letter scramble.

**v0.3.1**

Open the link on two phones, type a display name, tap **Create room** on one
and **Join** on the other, then read out the four-letter code.

No accounts, ads, chat, or purchases. Free Render services may take a short
while to wake if they have been asleep.

## Play

```
npm install
npm start
```

Then open `http://localhost:3000` on two browsers (or your phone on the same
network).

Each match is 6 turns each (12 in total). You have 60 seconds to make one
word of at least 2 letters. Letter points are shown on every tile. While you
build a word, a small “✓ word!” label appears under the rack if the selection
is in the dictionary. The room creator can switch on Fun mode, which also
accepts a curated slang list; slang-only words score their letter points plus
two, shown as “slang +2”. The main dictionary is left as it is, including
proper nouns. See [DICTIONARY.md](DICTIONARY.md) for sources and licences.

## Tests

```
npm test
LIVE_URL=https://word-duel.onrender.com npm run test:live
```

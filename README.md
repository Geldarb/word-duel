# Word Duel

A cosy real-time 1v1 word game for two phones. One of you creates a room, the
other joins with a short code, and you take turns making a word from a fresh
seven-letter scramble. You can also pick **Story Duel**, a shared silly story
with hidden answers, a dramatic reading, and anonymous votes.

**v0.4**

Open the link on two phones, type a display name, choose Word Duel or Story
Duel, tap **Create room** on one and **Join** on the other, then read out the
four-letter code.

No accounts, ads, chat, or purchases. Free Render services may take a short
while to wake if they have been asleep.

## Play

```
npm install
npm start
```

Then open `http://localhost:3000` on two browsers (or your phone on the same
network).

### Word Duel

Each classic match is 6 turns each (12 in total). You have 60 seconds to make
one word of at least 2 letters. Letter points are shown on every tile. Each
turn, one tile is a double letter (DL) or, less often, a double word (DW);
using that tile applies the bonus, and the turn result shows the breakdown.
While you build a word, a small “✓ word!” label appears under the rack if the
selection is in the dictionary. The room creator can switch on Fun mode, which
also accepts a curated slang list; slang-only words score their letter points
plus two, shown as “slang +2”. A Fun mode words page in the menu lists the
slang alphabetically. The main dictionary is left as it is, including proper
nouns. See [DICTIONARY.md](DICTIONARY.md) for sources and licences.

Soft sounds and phone vibration (where the phone allows it) mark tile taps,
valid words, and whose turn it is. Sound can be switched off in Settings.

Each phone keeps a simple match history against each opponent name, for Word
Duel and Story Duel separately. Nothing is stored on a server account.

### Story Duel

The room creator picks 5 or 8 blanks. Both of you get the same freshly mixed
silly story and fill the blanks in private, then the tale is read line by line
in a dramatic voice. Each line appears as two anonymous versions, you vote for
the funnier one, and then it is revealed who wrote what. Rematch deals a new
story of the same length.

## Tests

```
npm test
LIVE_URL=https://word-duel-8a46.onrender.com npm run test:live
LIVE_URL=https://word-duel-8a46.onrender.com npm run test:live-story
```

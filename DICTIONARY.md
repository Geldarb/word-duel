# Word list sources

Word Duel ships `data/words.txt`, a merged list of English words of 2–7 letters
(the longest word you can make from a 7-letter scramble). British spellings and
plenty of obscure words are included. Validation happens on the server only.

## ENABLE (public domain)

The ENABLE word list, compiled by Alan Beale and others, is in the public
domain. The copy used here came from
[dolph/dictionary](https://github.com/dolph/dictionary) (`enable1.txt`).

## 12dicts 2of4brif (public domain)

Alan Beale’s 12dicts package, including `2of4brif.txt`, is in the public
domain and is redistributed as part of SCOWL. It adds a British-leaning
everyday vocabulary.

## SCOWL / VarCon (permissive)

British spelling variants (for example *colour*, *realise*, *centre*,
*defence*) were taken from VarCon, part of Kevin Atkinson’s
[SCOWL](http://wordlist.aspell.net/) (Spell Checking Oriented Word Lists)
7.1. The SCOWL licence allows use, copy, modification, distribution and sale
without fee, provided the copyright notice appears in copies and in supporting
documentation. The full notice is in `licenses/SCOWL-Copyright.txt`.

  Copyright 2000-2011 by Kevin Atkinson

  Permission to use, copy, modify, distribute and sell these word
  lists, the associated scripts, the output created from the scripts,
  and its documentation for any purpose is hereby granted without fee,
  provided that the above copyright notice appears in all copies and
  that both that copyright notice and this permission notice appear in
  supporting documentation. Kevin Atkinson makes no representations
  about the suitability of this array for any purpose. It is provided
  "as is" without express or implied warranty.

## UK Advanced Cryptics Dictionary 1.7 (freeware)

Many rarer British crossword words come from the UK Advanced Cryptics
Dictionary, version 1.7 (23 August 2000), by J Ross Beresford.

  Copyright (c) J Ross Beresford 1993-2000. All Rights Reserved.

The UKACD may be used in a software package or redistributed provided the
copyright notice is prominently displayed and the text of the UKACD document
is included verbatim. That document is included in full at
`licenses/UKACD-README.TXT`.

## Common words for Crossword Race

Crossword Race puzzles are built only from 3–6 letter words in Alan Beale’s
public-domain 12dicts list `2of4brif.txt`. The filtered copy shipped here is
`data/common.txt`. This everyday vocabulary is used to pick a base word for
the letter wheel and the crossing words on the grid. The main 2–7 letter
dictionary in `data/words.txt` is unchanged and still used to judge Word Duel
turns.

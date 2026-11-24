// Secret Word -- the goal words for each level. Levels get harder through rarer words, not
// longer ones: STARTER is 3 letters, LEVEL 1 is 4, everything else 5. A word lives in only one level.
// Kept as plain space-separated strings so the lists are easy to read and add to.
window.SecretWordLists = {
  // STARTER (kindergarten): 3-letter everyday words and sight words -- 165 words
  k: `cat dog sun hat bed pig run map fox bus cup red top big hop sit jam net mud van web yes zip
    kid leg log man pan pet ten wig bug hen jet mom dad fun box six win bat rat mat fan can bag
    tag nap tap cap lap pad wet hug mug rug tub cub nut hut cut gum pup bun dig fig pin fin lip
    hip sip mix fix wax pot dot hot mop pop fog jog job sad mad hit kit lid zap jug yum hum wag
    tip cow owl egg ant ice ape ear eye arm pie toe hay bee toy bow saw jaw paw zoo key sky fly
    cry try day say pay way boy joy car jar art the and see you not one two she was are for has
    him his how new now our out put too who why all ate any did get had her let ran eat got off
    may old use ask`,

  // LEVEL 1 (grades 1-2): everyday 4-letter words -- 237 words
  l1: `frog jump fish ship shop tree blue play look like come help went they what down make ride
    cake bike star rain ball book call cold door duck find five four gave girl hand home just
    kind last long milk moon more name nest nice open over park pink read room sand sing soon
    stop swim tell time wall want wash wind wish work farm gift glad lamp sock shoe hill king
    ring song cook good seed bell doll drum fork bear deer goat lion seal crab worm lake game
    gate kite bone rope rose nose note baby fast slow sled flag clap drip spin skip trip chin
    chip chop shed wing sink pond corn barn cart bath boat coat road toad soap foam loaf goal
    mail tail sail pail wait seat team meal beak bean heat peak deep roof hoop pool tool noon
    zoom town gown howl coin join soil boil claw draw lawn hawk yawn horn born torn bark dark
    yard card hard harm turn burn hurt curl herd fern knee knot knit wrap wren lamb comb half
    calf wolf gold bolt colt lime mice rice dice cube tune rule whip math path moth both chat
    chew thin than then glow grow crow blow show flew blew grew drew stew bowl poke joke woke
    cave wave save leaf feet hook wool wood foot peel jeep load hair pair fair sour hour cord
    mild wild sigh`,

  // LEVEL 2 (grades 3-4): common 5-letter words -- 251 words
  l2: `plant smile train truck house mouse chair clock drink grass lunch paint queen sheep shell
    snack spoon stick store sweet three under white black brown green sleep happy funny water
    every about again cloud shout crown storm brave skate whale phone thumb snail dream beach
    bread crumb ghost giant heart horse juice lemon magic music night ocean party pizza puppy
    river robot shirt sugar table tiger tooth toast watch zebra apple bunny candy daisy dance
    earth eagle fairy field fruit grape honey igloo jelly koala laugh melon money north nurse
    otter peach pearl piano plate prize quiet radio skirt snake space sport stamp stone sunny
    teeth thank think towel tower wagon world write young chalk bench couch flute light right
    sound round clown frown brick cliff coast comet coral crane crash creek crisp drift eager
    flame flock frost glide globe grain grasp gravy habit haunt hover jewel knelt label lever
    lodge loyal maple march marsh mango medal metal moose noble orbit panic patch pedal pilot
    pinch plank plaza polar porch pouch quack quilt raven ridge roast rough scale scarf scent
    scout shark shine shore sight skill slope smoke solar spark speed spice spine spray squid
    steam steel sting stove swamp sword thief thorn trail treat trend trunk tulip vivid waltz
    wheat wheel whirl woven yeast acorn badge blaze bloom cocoa cable delta dwarf fable flash
    float fudge giddy hatch hippo jolly kneel lunar mossy nacho olive opera pasta plume quail
    ranch sauce sleet slick snore spoke stack swirl tango twirl vault`,

  // LEVEL 3 (grades 5-6): rarer 5-letter words -- 265 words
  l3: `adapt alert ample amuse ankle arena argue avoid basin blend bluff boast brisk cabin canal
    cargo cease chant charm civic clamp clash crude debut decay depth digit dodge draft dwell
    elbow elder empty equal erupt fiber flair focus forge gauge gleam grief haste hinge humid
    ideal image index irony issue ivory knack lapse latch mimic minor moist motto mural oasis
    onset optic outer oxide panel peril pivot prism proof prose prune pulse quota rally rapid
    realm relic rival rumor scorn sedan shaft siege slant solid stain stern stout strap surge
    swift tempo tidal toxic trait truce unite upper urban usage valid vigor vocal wedge weary
    wield witty yield zesty abbey adopt agent align angle annex aroma blunt bonus brief civil
    climb crest decoy dense eject ember exile feast fetch flaky hasty icing inlet lofty lyric
    macro mercy motif naval nerve nudge novel abate adorn affix allot alloy amass amble annul
    aorta avail axiom baron basil bleak broth brute cleft cumin decry demur ditch dregs droop
    dusky elite endow ensue equip erode ethic evoke fleet flint glaze gloom glyph grove guild
    gusty harsh heave hefty hoist hutch infer knoll lathe leery livid lurch moral morph mound
    ochre overt parry plead pluck poach pried prior probe prone quest rebel recur rigid rouse
    rural scant sever skimp slate sleek sling smirk snide spawn stark steep stint stray strew
    theme tract verse wager wrath yearn aloof brink clasp defer drawl dwelt ebony exert exult
    feral fiery frank grimy gruff knead lanky merge mince mogul nasal outdo rebut relay rogue
    sated scoff shirk sinew spire swarm tally tempt unify vexed`,

  // HIGH: hard 5-letter vocabulary (high school and up) -- 386 words
  high: `abide abyss acrid adept adore agile aloft amber amiss angst anvil aptly ardor askew attic
    audit augur avert awash azure bagel balmy banal bayou beget beret bevel bland bliss bloat
    blurb borax bough brash brawn briar brine brood brunt budge cache cadet cairn caper caste
    cedar chafe chasm chide chime chord cider cinch clout covet coyly crank crass craze creak
    credo crept crimp croon crypt cubic curio cynic dally dealt deign delve denim deter dirge
    ditty divot dogma dowdy dowry dross droll duvet edict eerie egret elegy elfin elope elude
    embed enact ennui envoy epoch epoxy ethos evade exact exalt expel extol facet fauna feign
    feint ferry fetid fiend filch finch fjord flail flank fleck flora floss flout fluke flume
    foray forte foyer frail frond froth furor gaffe gaily gamut gaudy gauze gavel gecko genre
    ghoul glean glint gloat gnash gnome golem gorge gouge gourd grail grate grime gripe grout
    guile guise gusto haiku hardy haven hazel heady heist helix heron hoard hovel humus husky
    hyena idiom idyll impel inane inept inert ingot inlay irate jaunt jaded joust kayak kebab
    knave krill laden lance lapel larva latte leafy leech lemur libel liege lilac limbo liner
    lithe llama loamy lucid lunge lurid macaw mange manor maxim mealy merit mirth miser molar
    morel mourn mulch murky musty myrrh nadir naive navel nexus niche nomad notch octet opine
    orate ought ovoid oxbow pansy parch pecan penne perch pesky petal piety pique pithy pixel
    plaid plait plumb plush poise polka posse prawn primp privy prong prowl psalm pulpy purge
    quaff qualm quash quell quirk quill rabid radar raspy ratio ravel recap regal rebus renew
    repel revel rhyme rigor riser roost rouge rowdy ruddy runic rusty sable sauna savvy scald
    scone scour scowl scrub sepia serum shard shawl shear sheen shrew shrub siren skulk slosh
    sloth snare sneer snipe snout solve sonic spate spiel spurn squat staid stalk stash stoic
    stoke stomp strut stunt suave surly swath swoon swoop synth syrup taboo tacit taffy talon
    tapir taunt tawny tease tenet tepid terse thyme tiara tibia timid titan token topaz torch
    totem toxin trawl trite troll trove truss tuber tulle tunic tweak umbra unfit untie usurp
    utter vague valor vapid verge vigil viper vista vogue vouch wafer waive weave whelp whiff
    whisk wince wispy woken wordy wrack wreak wrest wring yacht yodel`,
};

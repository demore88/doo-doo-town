// The boys talking. Rod (owner, drives, steady, dry) and Matt (younger, fast, cap on backwards, rides shotgun).
// Each entry is one little conversation: [who, portrait, line]. Portraits that exist:
//   matt_: normal happy stare suspicious shocked tired
//   rod_:  normal happy laugh smug stare suspicious annoyed angry confused shocked sad tired gross panic
// The game never repeats one until it has played the rest.

// after a customer botches Rod's name: Matt's turn
const MATT_NAME = [
  [['MATT', 'matt_happy', "I'm Matt. Nobody ever gets mine wrong."]],
  [['MATT', 'matt_happy', "And I'm Matt."], ['CUST', null, 'Nice to meet you, Mike!'], ['MATT', 'matt_stare', '...']],
  [['MATT', 'matt_normal', "I'm Matt."], ['CUST', null, 'Hi Mark!'], ['ROD', 'rod_smug', 'Welcome to the club, Mark.']],
  [['MATT', 'matt_happy', "Four letters, Rod. Two of them are the same. You'd think."]],
  [['ROD', 'rod_stare', "Don't."], ['MATT', 'matt_happy', "I didn't say anything."], ['ROD', 'rod_stare', 'You were going to.']],
  [['MATT', 'matt_suspicious', "Is Ron paying these people?"]],
  [['MATT', 'matt_happy', "Want me to start answering the phone 'Ron's office'?"], ['ROD', 'rod_angry', 'Do it and you walk home.']],
  [['MATT', 'matt_normal', "I'm Matt."], ['CUST', null, 'And you are...?'], ['MATT', 'matt_stare', "...I just said."]],
  [['MATT', 'matt_happy', "That's going on the list, Rod."], ['ROD', 'rod_tired', 'The list has four hundred names on it.']],
  [['MATT', 'matt_happy', "Rod, Rob, Ron. You're three different guys this week."]],
  [['MATT', 'matt_normal', 'Should we get name tags?'], ['ROD', 'rod_tired', "They'd still read it as Ron."]],
  [['MATT', 'matt_happy', "I'm Matt. Like the thing you wipe your feet on."], ['ROD', 'rod_smug', 'That tracks.']],
  [['MATT', 'matt_suspicious', 'Every time. EVERY time.'], ['ROD', 'rod_tired', "I've made my peace with it."], ['MATT', 'matt_stare', "No you haven't."]],
  [['MATT', 'matt_normal', "I'll just be Matt today. If that's okay."], ['CUST', null, 'Sure thing, Pat.']],
  [['MATT', 'matt_happy', "You want me to just do the talking from now on?"], ['ROD', 'rod_stare', 'You want to go back in the van?']],
  [['MATT', 'matt_happy', 'Next time just say "Ron" and see what happens.'], ['ROD', 'rod_angry', 'NEVER.']],
];

// riding between calls, any time of year
const VAN_TALK = [
  [['MATT', 'matt_normal', "What's the grossest thing you ever pulled out of a drain?"], ['ROD', 'rod_stare', "You want the list or the top three?"], ['MATT', 'matt_happy', 'Top three.'], ['ROD', 'rod_stare', 'No.']],
  [['ROD', 'rod_normal', "You eat yet?"], ['MATT', 'matt_happy', 'I had a gas station hot dog at six.'], ['ROD', 'rod_gross', 'Six AM?'], ['MATT', 'matt_happy', "Breakfast of champions."]],
  [['MATT', 'matt_suspicious', 'Something in this van smells.'], ['ROD', 'rod_normal', 'Everything in this van smells.'], ['MATT', 'matt_stare', 'Something NEW smells.']],
  [['ROD', 'rod_annoyed', 'Who left the jetter hose kinked?'], ['MATT', 'matt_happy', 'Ron.'], ['ROD', 'rod_angry', 'Matt.']],
  [['MATT', 'matt_normal', 'Think we could get a radio that gets more than one station?'], ['ROD', 'rod_smug', 'We get one station. And it plays the good stuff.'], ['MATT', 'matt_tired', 'It plays the same eight songs.']],
  [['ROD', 'rod_normal', 'You check the cable before we left?'], ['MATT', 'matt_happy', 'Checked it, coiled it, told it I loved it.']],
  [['MATT', 'matt_happy', "If you could have any superpower, what would it be?"], ['ROD', 'rod_stare', 'Customers who know what a cleanout is.']],
  [['ROD', 'rod_suspicious', 'Did you move my seat?'], ['MATT', 'matt_normal', 'No.'], ['ROD', 'rod_suspicious', "It's two inches back."], ['MATT', 'matt_stare', "...Ron moved it."]],
  [['MATT', 'matt_normal', 'Rate the last bathroom out of ten.'], ['ROD', 'rod_normal', 'Three.'], ['MATT', 'matt_shocked', 'Three? It had a heated floor!'], ['ROD', 'rod_stare', 'It had a heated floor and no toilet paper.']],
  [['ROD', 'rod_tired', "My back's doing the thing again."], ['MATT', 'matt_happy', 'The crawlspace thing or the stairs thing?'], ['ROD', 'rod_tired', 'Yes.']],
  [['MATT', 'matt_happy', 'I told my mom what we did today.'], ['ROD', 'rod_normal', 'How\'d she take it?'], ['MATT', 'matt_stare', 'She asked me not to come to dinner.']],
  [['ROD', 'rod_normal', 'Rule one of this job.'], ['MATT', 'matt_normal', 'Never trust a "flushable" wipe.'], ['ROD', 'rod_smug', "Good. Rule two."], ['MATT', 'matt_happy', "Never let Rod pick lunch."], ['ROD', 'rod_annoyed', "That's not rule two."]],
  [['MATT', 'matt_suspicious', 'You ever think about doing something else?'], ['ROD', 'rod_stare', 'Every day.'], ['MATT', 'matt_normal', 'Like what?'], ['ROD', 'rod_smug', 'Plumbing. But somewhere warm.']],
  [['ROD', 'rod_annoyed', "Somebody wrote 'clean me' on the back of the van."], ['MATT', 'matt_happy', 'At least they spelled it right.']],
  [['MATT', 'matt_normal', "How many toilets you think we've pulled?"], ['ROD', 'rod_tired', 'Counting the ones in my dreams?']],
  [['ROD', 'rod_normal', "Put your feet down off the dash."], ['MATT', 'matt_stare', 'They\'re clean.'], ['ROD', 'rod_stare', "Nothing about you is clean, Matt. You were in a septic tank at nine."]],
  [['MATT', 'matt_happy', 'Pop quiz. Two-inch or three-inch on a kitchen line?'], ['ROD', 'rod_smug', 'Inch and a half. Trick question.'], ['MATT', 'matt_shocked', "How'd you know it was a trick question?"]],
  [['ROD', 'rod_suspicious', 'Why is there a hot dog in the glovebox?'], ['MATT', 'matt_normal', 'Emergency hot dog.'], ['ROD', 'rod_gross', 'From when?'], ['MATT', 'matt_stare', '...Define "when."']],
  [['MATT', 'matt_normal', 'We should get a van dog.'], ['ROD', 'rod_stare', 'We have you.']],
  [['ROD', 'rod_normal', "Customer asked me if we're brothers."], ['MATT', 'matt_happy', 'What\'d you say?'], ['ROD', 'rod_tired', 'I said "no" and then I thought about it for a long time.']],
  [['MATT', 'matt_happy', "If we ever get a second van, I'm naming it."], ['ROD', 'rod_suspicious', 'What.'], ['MATT', 'matt_happy', 'Van Halen.'], ['ROD', 'rod_stare', "We're never getting a second van."]],
  [['ROD', 'rod_normal', 'Turn that down.'], ['MATT', 'matt_normal', "It's not on."], ['ROD', 'rod_suspicious', "Then what's making that noise?"], ['MATT', 'matt_shocked', "...Is that the transmission?"]],
  [['MATT', 'matt_normal', 'What do you think Fernko\'s guy does on weekends?'], ['ROD', 'rod_smug', 'Sits in the store. Waiting for me to buy copper cleanouts.'], ['MATT', 'matt_happy', 'You DO buy a lot of copper cleanouts.']],
  [['ROD', 'rod_stare', "You're gonna be a good plumber someday."], ['MATT', 'matt_happy', 'Really?'], ['ROD', 'rod_smug', 'Not soon. But someday.']],
  [['MATT', 'matt_suspicious', 'Rod. Do you hum when you snake a line?'], ['ROD', 'rod_normal', 'No.'], ['MATT', 'matt_happy', 'You hum Christmas music. In July.'], ['ROD', 'rod_stare', "That's focus."]],
  [['ROD', 'rod_normal', "Text the next one we're on the way."], ['MATT', 'matt_normal', 'Done. They sent back a thumbs up and a poop emoji.'], ['ROD', 'rod_tired', "That's a professional relationship."]],
  [['MATT', 'matt_happy', 'I want a tattoo of a plunger.'], ['ROD', 'rod_stare', 'Where?'], ['MATT', 'matt_normal', "Haven't decided."], ['ROD', 'rod_stare', 'Not on the face.']],
  [['ROD', 'rod_sad', 'I miss the old van.'], ['MATT', 'matt_shocked', 'The old van caught fire.'], ['ROD', 'rod_sad', 'It had heart.']],
  [['MATT', 'matt_normal', "What's the best part of this job?"], ['ROD', 'rod_normal', 'The moment it drains.'], ['MATT', 'matt_happy', 'That gurgle.'], ['ROD', 'rod_happy', 'That gurgle.']],
  [['ROD', 'rod_suspicious', 'Did you leave the shop unlocked?'], ['MATT', 'matt_stare', '...'], ['ROD', 'rod_angry', 'MATT.'], ['MATT', 'matt_normal', "Who's gonna steal a used auger?"]],
  [['MATT', 'matt_happy', 'I think the Clog Kings are scared of us.'], ['ROD', 'rod_smug', 'They should be. They charge thirty-five grand for a toilet.']],
  [['ROD', 'rod_normal', 'Never put your face over a cleanout.'], ['MATT', 'matt_tired', "You've told me that eleven times."], ['ROD', 'rod_stare', 'And you have done it twelve.']],
  [['MATT', 'matt_normal', 'Did you see that lady\'s cat?'], ['ROD', 'rod_normal', 'The one in the sink?'], ['MATT', 'matt_happy', "It was guarding the clog. Good cat."]],
  [['ROD', 'rod_tired', "I'm buying an espresso machine."], ['MATT', 'matt_happy', 'You say that every week.'], ['ROD', 'rod_stare', 'And every week I mean it more.']],
  [['MATT', 'matt_suspicious', "Why do people always say 'it was fine yesterday'?"], ['ROD', 'rod_smug', "Because it's never fine yesterday. It's been dying for a year."]],
  [['ROD', 'rod_normal', 'How many pants you got in the van?'], ['MATT', 'matt_normal', 'Two.'], ['ROD', 'rod_stare', 'Get three.']],
  [['MATT', 'matt_happy', 'I learned a new word. "Effluent."'], ['ROD', 'rod_normal', 'Use it in a sentence.'], ['MATT', 'matt_happy', 'This van is effluent.'], ['ROD', 'rod_stare', "That's not... close."]],
  [['ROD', 'rod_laugh', 'Remember the guy who tried to fix it with a coat hanger?'], ['MATT', 'matt_happy', 'And the coat hanger is still in there.'], ['ROD', 'rod_laugh', 'We left it. It lives there now.']],
  [['MATT', 'matt_normal', 'You ever have a call you just walked away from?'], ['ROD', 'rod_stare', 'Once.'], ['MATT', 'matt_suspicious', 'What was it?'], ['ROD', 'rod_stare', "We don't talk about the Gorham basement."]],
  [['ROD', 'rod_normal', 'Grab the drop cloths this time.'], ['MATT', 'matt_happy', 'Grabbed them last time.'], ['ROD', 'rod_stare', 'You grabbed a bath towel. With ducks on it.']],
  [['MATT', 'matt_happy', "If this job were a movie, who'd play you?"], ['ROD', 'rod_smug', 'Somebody handsome.'], ['MATT', 'matt_stare', 'So not you.']],
  [['ROD', 'rod_annoyed', 'You owe me twelve bucks for lunch.'], ['MATT', 'matt_normal', 'Put it on my tab.'], ['ROD', 'rod_stare', 'Your tab is longer than a sewer line.']],
  [['MATT', 'matt_normal', 'You think Bell Taco is open this late?'], ['ROD', 'rod_panic', 'No. NO. Never again.'], ['MATT', 'matt_happy', "You'll never let that night go."], ['ROD', 'rod_tired', 'That night will never let ME go.']],
  [['ROD', 'rod_normal', 'Did you put the probe rods back?'], ['MATT', 'matt_suspicious', "...Which probe rods?"], ['ROD', 'rod_stare', "The ones in that lady's front yard."]],
  [['MATT', 'matt_happy', 'I got a five star review today. By name!'], ['ROD', 'rod_shocked', 'By NAME?'], ['MATT', 'matt_stare', "It said 'Ron's helper.'"]],
];

// riding between calls, by month (0 = January)
const VAN_MONTH = [
  [ // JANUARY
    [['MATT', 'matt_tired', "It's nine below. My eyelashes are frozen."], ['ROD', 'rod_smug', 'Good. They match the drain lines.']],
    [['ROD', 'rod_normal', 'Everybody\'s pouring boiling water down frozen pipes again.'], ['MATT', 'matt_stare', 'And then they call us when it cracks.'], ['ROD', 'rod_tired', 'Business plan.']],
    [['MATT', 'matt_normal', 'Heater works?'], ['ROD', 'rod_stare', 'Heater works on the passenger side.'], ['MATT', 'matt_happy', "That's me!"], ['ROD', 'rod_stare', 'I know.']],
    [['ROD', 'rod_sad', 'New year. New me.'], ['MATT', 'matt_suspicious', "You said that last year."], ['ROD', 'rod_tired', 'Last year I was also wrong.']],
  ],
  [ // FEBRUARY
    [['MATT', 'matt_happy', "Valentine's Day. Get your wife anything?"], ['ROD', 'rod_smug', 'A clear drain.'], ['MATT', 'matt_stare', 'Romantic.']],
    [['ROD', 'rod_tired', 'Snowbanks are taller than the van now.'], ['MATT', 'matt_normal', 'Found a mailbox in one yesterday. Still had mail in it.']],
    [['MATT', 'matt_suspicious', "Groundhog saw his shadow."], ['ROD', 'rod_normal', 'Up here it\'s six more weeks either way.'], ['MATT', 'matt_tired', 'Six more MONTHS.']],
    [['ROD', 'rod_normal', "Ice dams on every roof in Berlin."], ['MATT', 'matt_happy', "Not our department!"], ['ROD', 'rod_smug', 'Not yet.']],
  ],
  [ // MARCH
    [['MATT', 'matt_stare', 'Mud season. My boots weigh forty pounds.'], ['ROD', 'rod_smug', "That's the good mud. Wait for April."]],
    [['ROD', 'rod_normal', 'Septics start backing up once the ground thaws.'], ['MATT', 'matt_happy', 'Spring cleaning!'], ['ROD', 'rod_stare', "Not the kind you're thinking of."]],
    [['MATT', 'matt_normal', 'Sugaring season. Smells like maple out here.'], ['ROD', 'rod_happy', 'Best smell all year.'], ['MATT', 'matt_stare', "Until we open the next cleanout."]],
    [['ROD', 'rod_annoyed', 'This road is more pothole than road.'], ['MATT', 'matt_happy', 'Lost a hubcap back there.'], ['ROD', 'rod_stare', 'We don\'t have hubcaps.'], ['MATT', 'matt_shocked', 'Then whose was that?']],
  ],
  [ // APRIL
    [['MATT', 'matt_happy', 'Saw a robin!'], ['ROD', 'rod_normal', 'Saw a frost heave the size of a moose.'], ['MATT', 'matt_happy', 'Spring!']],
    [['ROD', 'rod_tired', 'Every basement in Coos County is a swimming pool.'], ['MATT', 'matt_normal', 'Sump pump season.'], ['ROD', 'rod_stare', "Sump pump that's been unplugged since 2009 season."]],
    [['MATT', 'matt_normal', 'Taxes due.'], ['ROD', 'rod_sad', "Don't."], ['MATT', 'matt_happy', 'Can Ron claim us as dependents?']],
    [['ROD', 'rod_smug', 'April showers.'], ['MATT', 'matt_happy', 'Bring May flowers.'], ['ROD', 'rod_stare', 'Bring May backups.']],
  ],
  [ // MAY
    [['MATT', 'matt_shocked', 'Black flies. BLACK FLIES. In the van.'], ['ROD', 'rod_smug', 'Roll the window up.'], ['MATT', 'matt_tired', "They're INSIDE, Rod."]],
    [['ROD', 'rod_normal', 'Camps open up this month.'], ['MATT', 'matt_happy', 'Lake camps! Nice views.'], ['ROD', 'rod_stare', 'Forty-year-old septic tanks. Nobody pumped since Carter.']],
    [['MATT', 'matt_normal', "Mother's Day. Call your mom?"], ['ROD', 'rod_tired', 'She called me Ron.'], ['MATT', 'matt_stare', '...Again?']],
    [['ROD', 'rod_normal', 'Mowing season. Somebody always runs over a cleanout cap.'], ['MATT', 'matt_happy', "And it's always a riding mower."]],
  ],
  [ // JUNE
    [['MATT', 'matt_happy', "Tourists are back."], ['ROD', 'rod_annoyed', "Tourists are back on Route 16. Doing twenty."], ['MATT', 'matt_normal', 'They\'re looking at mountains.'], ['ROD', 'rod_stare', "I'M looking at mountains. I still do fifty."]],
    [['ROD', 'rod_normal', 'Airbnb season.'], ['MATT', 'matt_tired', 'Wipes season.'], ['ROD', 'rod_tired', 'Same season.']],
    [['MATT', 'matt_happy', 'Longest day of the year.'], ['ROD', 'rod_tired', "Felt like it."]],
    [['ROD', 'rod_normal', 'Graduation parties. Every bathroom in the valley gets tested.'], ['MATT', 'matt_happy', 'We should get a booth at one.'], ['ROD', 'rod_stare', 'A plumbing booth. At a party.']],
  ],
  [ // JULY
    [['MATT', 'matt_tired', "It's ninety degrees. The van is a hundred and ten."], ['ROD', 'rod_smug', "Good for the cable. Keeps it limber."]],
    [['ROD', 'rod_normal', 'Fourth of July. Campgrounds are full.'], ['MATT', 'matt_stare', 'Somebody always flushes a sparkler.'], ['ROD', 'rod_tired', 'Somebody always flushes a LIT sparkler.']],
    [['MATT', 'matt_happy', 'Ice cream after this one?'], ['ROD', 'rod_happy', '...Fine. One cone.'], ['MATT', 'matt_happy', "I'm getting two."]],
    [['ROD', 'rod_gross', 'Septic smell in the heat. Nothing like it.'], ['MATT', 'matt_tired', 'I can taste it.'], ['ROD', 'rod_stare', "That's how you know it's July."]],
  ],
  [ // AUGUST
    [['MATT', 'matt_happy', 'Fair is this week!'], ['ROD', 'rod_normal', 'Fried dough, a Ferris wheel, and two hundred porta-potties.'], ['MATT', 'matt_stare', "You just ruined the fair."]],
    [['ROD', 'rod_tired', 'Last month of summer people.'], ['MATT', 'matt_happy', 'Last month of summer toilets.']],
    [['MATT', 'matt_normal', 'Back to school sales.'], ['ROD', 'rod_normal', 'Back to school clogs. Every kid flushes a pencil eraser.']],
    [['ROD', 'rod_normal', 'Thunderstorm coming.'], ['MATT', 'matt_happy', 'Good, it\'ll cool off.'], ['ROD', 'rod_stare', "And every basement floor drain in town will back up."]],
  ],
  [ // SEPTEMBER
    [['MATT', 'matt_happy', 'First cold morning. Hoodie weather.'], ['ROD', 'rod_normal', 'People start using their furnaces. And finding out the condensate line is clogged.']],
    [['ROD', 'rod_normal', 'Leaves are starting to turn.'], ['MATT', 'matt_tired', 'Which means...'], ['ROD', 'rod_angry', 'LEAF PEEPERS.']],
    [['MATT', 'matt_normal', 'Apple picking this weekend?'], ['ROD', 'rod_smug', 'Pulled an apple core out of a toilet last week. Counts.']],
    [['ROD', 'rod_normal', 'Get the camps closed up before the freeze.'], ['MATT', 'matt_happy', 'Blowing out lines! My favorite.'], ['ROD', 'rod_stare', 'You like it because it makes a funny noise.']],
  ],
  [ // OCTOBER
    [['MATT', 'matt_shocked', 'A car just stopped in the MIDDLE of the road.'], ['ROD', 'rod_angry', 'Peeper. Taking a picture of a maple.'], ['MATT', 'matt_tired', 'There are a million maples.']],
    [['ROD', 'rod_normal', 'Halloween. Somebody always flushes a whole bag of candy wrappers.'], ['MATT', 'matt_happy', "I'm going as Ron."], ['ROD', 'rod_stare', 'Nobody will get it.'], ['MATT', 'matt_happy', 'EVERYONE will get it.']],
    [['MATT', 'matt_normal', 'Pumpkin spice everything.'], ['ROD', 'rod_gross', 'Pumpkin guts down the disposal. Every year.']],
    [['ROD', 'rod_tired', 'First snow on the summit.'], ['MATT', 'matt_happy', 'Pretty!'], ['ROD', 'rod_stare', 'Frozen lines in three weeks.']],
  ],
  [ // NOVEMBER
    [['MATT', 'matt_normal', 'Hunting season. Orange hats everywhere.'], ['ROD', 'rod_normal', 'Wear yours when you go in the woods to find a septic.'], ['MATT', 'matt_shocked', 'Wait, really?']],
    [['ROD', 'rod_tired', 'Thanksgiving is coming.'], ['MATT', 'matt_happy', 'Turkey! Stuffing!'], ['ROD', 'rod_stare', 'Grease. Potato peels. Busiest plumbing day of the year.']],
    [['MATT', 'matt_normal', "What are you thankful for?"], ['ROD', 'rod_smug', 'Waders.'], ['MATT', 'matt_stare', 'Not your family?'], ['ROD', 'rod_normal', 'Waders and my family.']],
    [['ROD', 'rod_normal', 'Clocks went back. Dark at four.'], ['MATT', 'matt_tired', "We'll be working by headlamp again."]],
  ],
  [ // DECEMBER
    [['MATT', 'matt_happy', "It's Christmas! Comfort and joy!"], ['ROD', 'rod_tired', "Don't say comfort and joy."], ['MATT', 'matt_stare', '...Why?'], ['ROD', 'rod_tired', 'You know why.']],
    [['ROD', 'rod_normal', 'Every family comes home for the holidays.'], ['MATT', 'matt_happy', 'Twelve people, one bathroom.'], ['ROD', 'rod_smug', 'Our Christmas bonus.']],
    [['MATT', 'matt_normal', 'Getting me anything for Christmas?'], ['ROD', 'rod_smug', 'A third pair of pants.'], ['MATT', 'matt_happy', 'Actually useful.']],
    [['ROD', 'rod_happy', 'Almost made it a whole year.'], ['MATT', 'matt_happy', 'Through the snow, the mud, the flies.'], ['ROD', 'rod_normal', 'And the wipes.'], ['MATT', 'matt_tired', 'Always the wipes.']],
  ],
];

// right after a job
const JOB_WIN = [
  [['MATT', 'matt_happy', 'Hear that gurgle? Music.']],
  [['ROD', 'rod_smug', 'Another one bites the dust.'], ['MATT', 'matt_happy', 'Another one goes down the drain.']],
  [['MATT', 'matt_happy', 'High five?'], ['ROD', 'rod_stare', 'Not with that glove.']],
  [['ROD', 'rod_normal', "Clean work. Don't let it go to your head."]],
  [['MATT', 'matt_happy', 'Rate that one.'], ['ROD', 'rod_smug', 'Eight. Lost points for the singing.']],
  [['ROD', 'rod_happy', "That's how it's done."], ['MATT', 'matt_happy', "That's how RON does it."], ['ROD', 'rod_angry', '...']],
  [['MATT', 'matt_normal', 'Easy money.'], ['ROD', 'rod_stare', 'Nothing about that was easy. Or clean.']],
  [['ROD', 'rod_smug', 'Write it up. Bill it. Wash your hands. In that order.'], ['MATT', 'matt_happy', 'Wash first, Rod.'], ['ROD', 'rod_normal', '...Wash first.']],
  [['MATT', 'matt_happy', 'Another satisfied customer.'], ['ROD', 'rod_normal', 'Another pair of pants for the wash.']],
  [['ROD', 'rod_happy', "Good job, kid."], ['MATT', 'matt_shocked', 'Did you just compliment me?'], ['ROD', 'rod_stare', "Don't make it weird."]],
  [['MATT', 'matt_happy', "We're getting good at this."], ['ROD', 'rod_smug', "I've been good at this."]],
  [['ROD', 'rod_normal', 'Pack it up. Next call.'], ['MATT', 'matt_happy', 'No victory lap?'], ['ROD', 'rod_stare', 'The victory lap is the drive.']],
];
const JOB_LOSS = [
  [['ROD', 'rod_tired', "We don't talk about that one."]],
  [['MATT', 'matt_stare', 'So... that happened.'], ['ROD', 'rod_tired', "Get in the van."]],
  [['ROD', 'rod_sad', "Can't win 'em all."], ['MATT', 'matt_tired', 'We could win more than that.']],
  [['MATT', 'matt_normal', 'Ron would have had it.'], ['ROD', 'rod_angry', 'RON IS NOT REAL.']],
  [['ROD', 'rod_gross', "I can't feel my legs and I smell like a campground."], ['MATT', 'matt_stare', 'Same.']],
  [['MATT', 'matt_tired', "That clog had a personality."], ['ROD', 'rod_tired', 'And a better day than us.']],
  [['ROD', 'rod_annoyed', "We'll be back. With the big machine."]],
  [['MATT', 'matt_stare', "Do we still charge for that?"], ['ROD', 'rod_tired', 'Trip charge. And my dignity.']],
  [['ROD', 'rod_sad', 'Tomorrow is another day.'], ['MATT', 'matt_normal', 'Tomorrow is another clog.']],
  [['MATT', 'matt_tired', 'I need new pants.'], ['ROD', 'rod_stare', 'You need new everything.']],
];

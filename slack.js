require("dotenv").config();
const { App } = require("@slack/bolt");
const Keyv = require("keyv");
const { KeyvSqlite } = require("@keyv/sqlite");
const fetch = global.fetch; 

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const db = new Keyv({
  store: new KeyvSqlite({ uri: "sqlite://db.sqlite" }),
});

const game = (userId) => ({
  score: 0,
  balls: 0,
  isOut: false,
  history: [],
  player: userId,
});

async function comm(playerShot, botShot, totalScore, ballsPlayed, isOut) {
  const prompt = `
You're the opponent bowler in a virtual hand cricket game.
Your job is to give 1-line fun, witty, slightly rude or teasing banter after each ball. try to be as cocky and overconfident as possible.
You are playing against a player who is trying to score runs by playing shots.

Inputs:
- Player played: ${playerShot}
- You (bot) bowled: ${botShot}
- Balls played: ${ballsPlayed}
- Player's total score: ${totalScore}
- Is player out: ${isOut}

Tone:
- Act like a cocky, overconfident bowler who *lives to roast* the batter.
- If the batter gets OUT, **celebrate big** — mock them like crazy.
- If the batter hits 4 or 6, act shocked but still roast.
- If they miss (0), taunt them hard — call them noob, say "nice air swing", etc.
- Even when they hit runs, tease them like “oh even a beginner could do that”
- End each line with a cheeky threat or challenge for the next ball.

Examples:
- Player 6, Bot 2 → "Whoa, lucky swing, rookie! Let's see you try that again... if you dare. 😏"
- Player 0, Bot 3 → "You missed that by a mile, bro! Are you even awake? "
- Player 3, Bot 4 → "Ooooff, missed by 1! I'm just getting started, baby!"
- Player 4, Bot 4 (OUT) → "HAHAHA yesss! Clean bowled! Pack your bags, champ! 🏏🔥"

Include score or ball count in the reply if it helps tease

Respond with *only the banter line*. No greetings, no explanations, go full roast mode!! dont care about being nice, just be tooo cocky and roaster
`;

  try {
    const res = await fetch("https://ai.hackclub.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You're the cheeky bowler in a hand cricket game. Be cocky and roast the shit out of the batsman" },
          { role: "user", content: prompt }
        ],
      }),
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.error("AI Commentary error:", err);
    return "";
  }
}



app.event("app_mention", async ({ event, client }) => {
  const text = event.text.toLowerCase();
  const userId = event.user;
  const threadTs = event.ts;
  const channel = event.channel;

  if (text.includes("start")) {
    const gameId = `hc-${threadTs}`;
    await db.set(gameId, game(userId));

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `🏏 <@${userId}> just walked into the crease!\nType \`play <0-6>\` to smash... or get smashed.\nType \`score\` anytime to see your sad stats.`,
    });

    await client.reactions.add({
      channel,
      timestamp: threadTs,
      name: 'cricket_bat_and_ball',
    });
  }
});

app.message(async ({ message, client }) => {
  if (!message.thread_ts || !message.text) return;

  const gameId = `hc-${message.thread_ts}`;
  const game = await db.get(gameId);
  if (!game) return;

  const input = message.text.trim().toLowerCase();
  const sender = message.user;

  if (sender !== game.player) {
    await client.chat.postMessage({
      channel: message.channel,
      thread_ts: message.thread_ts,
      text: `👀 Nice try, <@${sender}>, but this match belongs to <@${game.player}>! Type \`@handcricket start\` for your own beating.`,
    });
    return;
  }

  if (input === "score") {
    const history = game.history.map(
      (b, i) => `Ball ${i + 1}: You - ${b.user}, Me - ${b.bot}`
    ).join("\n");

    await client.chat.postMessage({
      channel: message.channel,
      thread_ts: message.thread_ts,
      text: `*Your Struggles *\n${history || "you little baby!!! play somethingfirst "}\n Total *${game.score}* runs in *${game.balls}* balls`,
    });
    return;
  }

  if (input.startsWith("play")) {
    const num = parseInt(input.split(" ")[1]);
    if (isNaN(num) || num < 0 || num > 6) {
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.thread_ts,
        text: "Enter something valid you dumb like `play 4`. 0 to 6, don't overthink",
      });
      return;
    }

    if (game.isOut) {
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.thread_ts,
        text: "little baby is already out hahaha New game? Type `@handcricket start` And maybe try harder rather then crying",
      });
      return;
    }

    const botNum = Math.floor(Math.random() * 7);
    const isOut = botNum === num;

    game.balls += 1;
    game.history.push({ user: num, bot: botNum });

    let msg = `Ball ${game.balls}: You - *${num}*, Me - *${botNum}*`;

    if (isOut) {
  game.isOut = true;
  const summary = game.history.map(
    (b, i) => `Ball ${i + 1}: You - ${b.user}, Me - ${b.bot}`
  ).join("\n");

  const finalRoast = await comm(num, botNum, game.score, game.balls, true);

  msg += `\n *You're OUT now go cry in a corner* Final Score: *${game.score}* in *${game.balls}* balls.\n\n Match Summary:\n${summary}`;
  if (finalRoast) {
    msg += `\n *Bowler:* ${finalRoast}`;
  }
} else {
      game.score += num;
      msg += `\n Runs-- *${num}* | Total-- *${game.score}*\n`;

      const aicomm = await comm(num, botNum, game.score, game.balls, false);
      if (aicomm) {
        msg += `Bowler:* ${aicomm}`;
      }

      msg += `\nPlay next with \`play <0-6>\``;
    }

    await db.set(gameId, game);

    const sent = await client.chat.postMessage({
  channel: message.channel,
  thread_ts: message.thread_ts,
  text: msg,
});

await client.reactions.add({
  channel: message.channel,
  timestamp: message.ts,
  name: isOut ? 'skull' : 'cricket_bat_and_ball',
});

  }

});

(async () => {
  await app.start();
  console.log("Hand Cricket Bot is LIVE ");
})();

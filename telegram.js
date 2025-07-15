require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fetch = global.fetch;
const Keyv = require("keyv");
const { KeyvSqlite } = require("@keyv/sqlite");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

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
          { role: "system", content: "You re the cheeky bowler in a hand cricket game be cocky and roast the shit out of the batsman" },
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

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  await db.set(`tg-${userId}`, game(userId));

  bot.sendMessage(chatId, ` you stepped onto the crease, <b>${msg.from.first_name}</b>!\nSend <code>play 0-6</code> to hit.\nSend <code>score</code> to check your stats (aka failures).`, { parse_mode: "HTML" });
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.toLowerCase()?.trim();

  if (!text || text.startsWith("/start")) return;

  const gameId = `tg-${userId}`;
  const game = await db.get(gameId);
  if (!game) {
    bot.sendMessage(chatId, "Start a game first with /start loser");
    return;
  }

  if (text === "score") {
    const history = game.history.map((b, i) => `Ball ${i + 1}: You - ${b.user}, Me - ${b.bot}`).join("\n") || "you little baby!!! play somethingfirst";
    return bot.sendMessage(chatId, `<b>Your Scorecard</b>\n${history}\n🏏 Total: <b>${game.score}</b> in <b>${game.balls}</b> balls.`, { parse_mode: "HTML" });
  }

  if (text.startsWith("play")) {
    const num = parseInt(text.split(" ")[1]);
    if (isNaN(num) || num < 0 || num > 6) {
      return bot.sendMessage(chatId, "Type like `play 4` you dumb");
    }

    if (game.isOut) {
      return bot.sendMessage(chatId, "💀 You're already out bro Start over with /start to again lose");
    }

    const botNum = Math.floor(Math.random() * 7);
    const isOut = botNum === num;

    game.balls += 1;
    game.history.push({ user: num, bot: botNum });

    let msgText = ` Ball ${game.balls}: You - ${num}, Me - ${botNum}`;

    if (isOut) {
      game.isOut = true;
      const summary = game.history.map((b, i) => `Ball ${i + 1}: You - ${b.user}, Me - ${b.bot}`).join("\n");
      const roast = await comm(num, botNum, game.score, game.balls, true);
      msgText += `\n <b>OUT!</b> Final-- <b>${game.score}</b> in <b>${game.balls}</b> balls.\n\n${roast}\n\n Summary of loser\n${summary}`;
    } else {
      game.score += num;
      const roast = await comm(num, botNum, game.score, game.balls, false);
      msgText += `\n Runs: ${num} | Total-- ${game.score}\n ${roast}\nNext ball? \`play 0-6\``;
    }

    await db.set(gameId, game);
    return bot.sendMessage(chatId, msgText, { parse_mode: "HTML" });
  }
});

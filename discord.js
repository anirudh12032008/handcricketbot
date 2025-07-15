require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const Keyv = require("keyv");
const { KeyvSqlite } = require("@keyv/sqlite");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
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

async function comm(p, b, total, balls, isOut) {
  const prompt = `
You're the opponent bowler in a virtual hand cricket game.
Your job is to give 1-line fun, witty, slightly rude or teasing banter after each ball. try to be as cocky and overconfident as possible.
You are playing against a player who is trying to score runs by playing shots.

Inputs:
- Player played: ${p}
- You (bot) bowled: ${b}
- Balls played: ${balls}
- Player's total score: ${total}
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
          { role: "system", content: "Youre the cheeky bowler in a hand cricket game be cocky and roast the shit out of the batsman" },
          { role: "user", content: prompt }
        ],
      }),
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch (err) {
    console.error("AI Commentary error--", err);
    return "";
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();
  const channel = message.channel;
  const userId = message.author.id;
  const username = message.author.username;

  const gameId = `dc-${channel.id}-${userId}`;
  let game = await db.get(gameId);

  if (content === "!start") {
    await db.set(gameId, game(userId));
    await channel.send(`🏏 ${username} just walked in! Type \`!play <0-6>\` to begin your downfall. 💀`);
    return;
  }

  if (!game) return;

  if (content === "!score") {
    const history = game.history.map((b, i) => `Ball ${i + 1}: You - ${b.user}, Me - ${b.bot}`).join("\n");
    await channel.send(`📊 *Scorecard:*
${history || "No shots yet, scaredy cat!"}
🏏 *Total:* ${game.score} in ${game.balls} balls.`);
    return;
  }

  if (content.startsWith("!play")) {
    const num = parseInt(content.split(" ")[1]);
    if (isNaN(num) || num < 0 || num > 6) {
      await channel.send("🤡 You need to enter something like `!play 4` — it's not rocket science!");
      return;
    }

    if (game.isOut) {
      await channel.send("💀 You're already OUT, rookie. Start a new game with `!start` if you dare.");
      return;
    }

    const botNum = Math.floor(Math.random() * 7);
    const isOut = botNum === num;
    game.balls++;
    game.history.push({ user: num, bot: botNum });

    let msg = `Ball ${game.balls}: You - **${num}**, Me - **${botNum}**`;

    if (isOut) {
      game.isOut = true;
      const summary = game.history.map((b, i) => `Ball ${i + 1}: You - ${b.user}, Me - ${b.bot}`).join("\n");
      const finalRoast = await comm(num, botNum, game.score, game.balls, true);
      msg += `\n *OUT!* Final Score-- **${game.score}** in **${game.balls}** balls.`;
      msg += `\n\n *Summary--*\n${summary}`;
      if (finalRoast) msg += `\n *bowler---* ${finalRoast}`;
    } else {
      game.score += num;
      const roast = await comm(num, botNum, game.score, game.balls, false);
      msg += `\n Runs: **${num}** | Total-- **${game.score}**`;
      if (roast) msg += `\n *bowler:* ${roast}`;
      msg += `\nPlay next with \`!play <0-6>\``;
    }

    await db.set(gameId, game);
    await channel.send(msg);
  }
});

client.once("ready", () => {
  console.log("Discordis up ");
});

client.login(process.env.DISCORD_BOT_TOKEN);

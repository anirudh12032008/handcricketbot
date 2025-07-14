require("dotenv").config();
const { App } = require("@slack/bolt");
const Keyv = require("keyv");
const { KeyvSqlite } = require("@keyv/sqlite");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const db = new Keyv({
  store: new KeyvSqlite({ uri: "sqlite://db.sqlite" }),
});

const createNewGame = (userId) => ({
  score: 0,
  balls: 0,
  isOut: false,
  history: [],
  player: userId,
});

app.event("app_mention", async ({ event, client }) => {
  const text = event.text.toLowerCase();
  const userId = event.user;
  const threadTs = event.ts;
  const channel = event.channel;

  if (text.includes("start")) {
    const gameId = `hc-${threadTs}`;

    await db.set(gameId, createNewGame(userId));

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: ` <@${userId}> started a Hand Cricket match!\nPlay your shot by replying in this thread: \`play 0-6\``,
    });

    return;
  }
});

app.message(async ({ message, client, say }) => {
  if (!message.thread_ts || !message.text) return;

  const gameId = `hc-${message.thread_ts}`;
  const game = await db.get(gameId);
  if (!game) return; 

  const input = message.text.trim().toLowerCase();

  if (input.startsWith("play")) {
    const num = parseInt(input.split(" ")[1]);
    if (isNaN(num) || num < 0 || num > 6) {
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.thread_ts,
        text: "Enter a valid number ",
      });
      return;
    }

    if (game.isOut) {
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.thread_ts,
        text: "Game already ended. Type `@handcricket start` to start a new match.",
      });
      return;
    }

    const botNum = Math.floor(Math.random() * 7);
    const isOut = botNum === num;

    game.balls += 1;
    game.history.push({ user: num, bot: botNum });

    let msg = `Ball ${game.balls}: YOUUU - *${num}*, MEEE - *${botNum}*\n`;

    if (isOut) {
      game.isOut = true;
      msg += `You're *OUT* hahahaha :roo-evil: ! Final Score: *${game.score}* in *${game.balls}* balls`;
    } else {
      game.score += num;
      msg += `Runs: *${num}* | Total: *${game.score}*\nReply again to play next ball!`;
    }

    await db.set(gameId, game);

    await client.chat.postMessage({
      channel: message.channel,
      thread_ts: message.thread_ts,
      text: msg,
    });
  }
});

(async () => {
  await app.start();
  console.log("⚡ Hand Cricket Public Thread Bot is LIVE");
})();

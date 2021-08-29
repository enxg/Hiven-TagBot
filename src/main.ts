import { Client } from "hiven";
import { config } from "dotenv-cra";
import Prisma     from '@prisma/client';

const { PrismaClient } = Prisma;

process.env.NODE_ENV ??= "development";

config();
const prisma = new PrismaClient();
const cache = new Map();
const client = new Client({ type: "user" });

const prefix = "?";

client.on("init", () => {
  console.log("Ready!");
});

client.on("message", async (msg) => {
  if (!msg.content.startsWith(prefix) || msg.author?.id === client.user?.id) return;
  const args = msg.content.slice(prefix.length).trim().split(' ');
  const command = args.shift()?.toLowerCase() ?? null;

  if (command === "ping") return msg.room.send("Pong!");

  if (command === "tag") {
    if (!msg.house) return msg.room.send("You can't use this command in DM's.");
    if (msg.house.owner?.id !== msg.author?.id) return msg.room.send("This command can only be used by House Owner.");

    const options = {
      create: ["create", "+", "add"],
      remove: ["remove", "-", "delete"],
    };
    const option = args.shift()?.toLowerCase() ?? "help";

    if (options.create.includes(option)) {
      const tag = args.shift()?.toLowerCase();
      const content = args.join(" ");

      if (!tag || !content) return msg.room.send(`Example Usage: \`?tag ${option} hi Hello World!\``);
      const tagExists = () => {
        return msg.room.send("A tag with this name already exists. Use `?tag edit` to edit the tag.");
      };
      if (cache.has(`${msg.house.id}.${tag}`)) return tagExists();

      const query = await prisma.tags.findUnique({
        where: {
          house_tag: {
            house: msg.house.id,
            tag,
          },
        },
      });
      if (!!query) return tagExists();

      return prisma.tags.create({
        data: {
          house: msg.house.id,
          tag,
          content,
        },
      })
        .then(() => {
          cache.set(`${msg.house.id}.${tag}`, content);
          return msg.room.send(`Successfully created tag: \`${tag}\``);
        })
        .catch(() => {
          return msg.room.send(`An error occurred while creating tag: \`${tag}\``);
        });
    }
  }
});

client.connect(process.env.TOKEN ?? "")
  .then(() => console.log("Logged in!"))
  .catch(() => {
    console.log("Invalid Token!");
    process.exit(1);
  });

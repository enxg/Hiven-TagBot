import { Client }   from "hiven";
import { config }   from "dotenv-cra";
import { DateTime } from "luxon";
import Prisma       from '@prisma/client';
import { table }    from "table";
import commands     from "./commands.json";

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
  if (!msg.house && !msg.content.startsWith(prefix) && msg.author?.id !== client.user?.id) {
    const inv = msg.content.split("/").reverse()[0];
    return client.houses.Join(inv)
      .then(() => msg.room.send("Joined your house, cool house btw!"))
      .catch((e) => {
        console.log(e);
        return msg.room.send("Joined your house, cool house btw!"); // Temporary, because of a bug in hiven.js
      });
  }

  if (!msg.content.startsWith(prefix) || msg.author?.id === client.user?.id) return;
  const args = msg.content.slice(prefix.length).trim().split(' ');
  const command = args.shift()?.toLowerCase() ?? null;
  if (!command) return;

  if (command === "ping") return msg.room.send("Pong!");

  if (command === "help") {
    const helpMenu = commands.commands
      .reverse()
      .map(a => `${a[0]} - **${a[1]}** - ${a[2]}`)
      .join("\n");

    return msg.room.send(`${helpMenu}\n\nYou can access tags anytime by using \`?<tagname>\`, e.g. \`?hi\` `);
  }

  if (!msg.house) return msg.room.send("You can't use this command in DM's.");

  if (command === "tag") {

    const options = {
      create: ["create", "+", "add"],
      remove: ["remove", "-", "delete"],
      edit: ["edit"],
      info: ["info"],
      list: ["list", "l"],
    };
    const option = args.shift()?.toLowerCase() ?? "";

    if (options.info.includes(option)) {
      const tag = args.shift()?.toLowerCase();

      if (!tag) return msg.room.send(`Example Usage: \`?tag ${option} hi\``);
      const tagDoesntExist = () => {
        return msg.room.send(`A tag with the name \`${tag}\` doesn't exist.`);
      };

      const query = await prisma.tags.findUnique({
        where: {
          house_tag: {
            house: msg.house.id,
            tag,
          },
        },
      });
      if (!query) return tagDoesntExist();

      const createdAt = DateTime.fromJSDate(query.createdAt);
      const updatedAt = DateTime.fromJSDate(query.updatedAt);

      return msg.room.send([
        `**Tag**: ${tag}`,
        `**Content**: ${query.content}`,
        `**Created At**: ${createdAt.toLocaleString(DateTime.DATETIME_FULL)} (${createdAt.toRelative()})`,
        `**Updated At**: ${updatedAt.toLocaleString(DateTime.DATETIME_FULL)} (${updatedAt.toRelative()})`,
      ].join("\n"));
    }

    if (options.list.includes(option)) {
      const query = await prisma.tags.findMany({
        where: {
          house: msg.house.id,
        },
        orderBy: {
          tag: "asc",
        },
      });

      if (query.length === 0) return msg.room.send("This house doesn't have any tags.");

      let i = 0;
      let ii = 0;
      const tags: string[][] = [[]];

      for (const { tag } of query) {
        if (ii > 250) {
          i++;
          tags.push([]);
          ii = 0;
        }

        tags[i].push(tag);
        ii += tag.length;
      }

      try {
        return tags.forEach((t) => {
          void msg.room.send(t.map(tt => `\`${tt}\``).join(" "));
        });
      } catch (e) {
        console.log(e);
        return msg.room.send("An error occurred while sending a list of the tags.");
      }
    }

    if (msg.house.owner?.id !== msg.author?.id) return msg.room.send("This command can only be used by the House Owner.");

    if (options.create.includes(option)) {
      const tag = args.shift()?.toLowerCase();
      const content = args.join(" ");

      if (!tag || !content) return msg.room.send(`Example Usage: \`?tag ${option} hi Hello World!\``);
      if (content.length > 1500) return msg.room.send("Tag content can't be more than 1500 characters.");
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

    if (options.remove.includes(option)) {
      const tag = args.shift()?.toLowerCase();

      if (!tag) return msg.room.send(`Example Usage: \`?tag ${option} hi\``);
      const tagDoesntExist = () => {
        return msg.room.send(`A tag with the name \`${tag}\` doesn't exist.`);
      };

      const query = await prisma.tags.findUnique({
        where: {
          house_tag: {
            house: msg.house.id,
            tag,
          },
        },
      });
      if (!query) return tagDoesntExist();

      return prisma.tags.delete({
        where: {
          house_tag: {
            house: msg.house.id,
            tag,
          },
        },
      })
        .then(() => {
          cache.delete(`${msg.house.id}.${tag}`);
          return msg.room.send(`Successfully deleted tag: \`${tag}\``);
        })
        .catch(() => {
          return msg.room.send(`An error occurred while deleting tag: \`${tag}\``);
        });
    }

    if (options.edit.includes(option)) {
      const tag = args.shift()?.toLowerCase();
      const content = args.join(" ");

      if (!tag || !content) return msg.room.send(`Example Usage: \`?tag ${option} hi Hi World!\``);
      if (content.length > 1500) return msg.room.send("Tag content can't be more than 1500 characters.");
      const tagDoesntExist = () => {
        return msg.room.send(`A tag with the name \`${tag}\` doesn't exist.`);
      };

      const query = await prisma.tags.findUnique({
        where: {
          house_tag: {
            house: msg.house.id,
            tag,
          },
        },
      });
      if (!query) return tagDoesntExist();

      return prisma.tags.update({
        where: {
          house_tag: {
            house: msg.house.id,
            tag,
          },
        },
        data: {
          tag,
          content,
        },
      })
        .then(() => {
          cache.set(`${msg.house.id}.${tag}`, content);
          return msg.room.send(`Successfully edited tag: \`${tag}\``);
        })
        .catch(() => {
          return msg.room.send(`An error occurred while editing tag: \`${tag}\``);
        });
    }

    return msg.room.send("Use `?help` to see the correct usage.");
  }

  if (cache.has(`${msg.house.id}.${command}`)) {
    return msg.room.send(cache.get(`${msg.house.id}.${command}`));
  }

  const query = await prisma.tags.findUnique({
    where: {
      house_tag: {
        house: msg.house.id,
        tag: command,
      },
    },
  });

  if (!query) return;
  cache.set(`${msg.house.id}.${command}`, query.content);
  return msg.room.send(query.content)
    .catch(null);
});

client.connect(process.env.TOKEN ?? "")
  .then(() => console.log("Logged in!"))
  .catch(() => {
    console.log("Invalid Token!");
    process.exit(1);
  });

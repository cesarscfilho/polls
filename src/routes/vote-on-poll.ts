import z from "zod";
import { randomUUID } from "node:crypto";
import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { voting } from "../utils/voting-pub-sub";

export async function voteOnPoll(app: FastifyInstance) {
  app.post("/polls/:pollId/votes", async (req, reply) => {
    const voteOnPollBody = z.object({
      pollOptionId: z.string().cuid(),
    });

    const voteOnPollParams = z.object({
      pollId: z.string().cuid(),
    });

    const { pollId } = voteOnPollParams.parse(req.params);
    const { pollOptionId } = voteOnPollBody.parse(req.body);

    let { sessionId } = req.cookies;

    if (sessionId) {
      const userPreviousVotesOnPoll = await prisma.vote.findUnique({
        where: {
          sessionId_pollId: {
            sessionId,
            pollId,
          },
        },
      });

      if (userPreviousVotesOnPoll.pollOptionId !== pollOptionId) {
        await prisma.vote.delete({
          where: {
            id: userPreviousVotesOnPoll.id,
          },
        });

        const votes = await redis.zincrby(pollId, -1, userPreviousVotesOnPoll.pollId);

        voting.public(pollId, {
          pollOptionId,
          votes: Number(votes)
        })
      } else if (userPreviousVotesOnPoll) {
        return reply
          .status(400)
          .send({ message: "You already voted on this poll." });
      }
    }

    if (!sessionId) {
      sessionId = randomUUID();

      reply.setCookie("sessionId", sessionId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        signed: true,
        httpOnly: true,
      });
    }

    await prisma.vote.create({
      data: {
        sessionId,
        pollId,
        pollOptionId,
      },
    });

    const votes = await redis.zincrby(pollId, 1, pollOptionId);

    voting.public(pollId, {
      pollOptionId,
      votes: Number(votes)
    })

    return reply.status(201).send();
  });
}

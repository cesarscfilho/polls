import { FastifyInstance } from "fastify";
import { voteOnPoll } from "../../routes/vote-on-poll";
import z from "zod";
import { voting } from "../../utils/voting-pub-sub";

export async function pollResults(app: FastifyInstance){
    app.get('/polls/:pollId/results', { websocket: true }, (connection, request) => {
        const getPollParams = z.object({
            pollId: z.string().cuid()
        })

        const { pollId } = getPollParams.parse(request.params)

        voting.subscribe(pollId, (message) => {
            connection.socket.send(JSON.stringify(message))
        })
    })
}
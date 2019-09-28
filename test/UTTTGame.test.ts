import { expect } from "chai";
import * as sinon from "sinon";

import UTTTGame from "../src/UTTTGame";

type TestGame = {
    game: UTTTGame,
    channel: {
        sendMessageToPlayer: sinon.SinonSpy,
        sendGameEnded: sinon.SinonSpy,
    },
};

const players = [
    "player1",
    "player2",
];

const getGame = (): TestGame => {
    const sendMessageToPlayer = sinon.spy();
    const sendGameEnded = sinon.spy();

    const game = new UTTTGame(
        players,
        sendMessageToPlayer,
        sendGameEnded,
    );

    return {
        channel: {
            sendGameEnded,
            sendMessageToPlayer,
        },
        game,
    };
};

describe("UTTTGame", () => {
    it("start() sends relevant messages", () => {
        const testGame = getGame();

        testGame.game.start();

        players.forEach((player, $index) => {
            expect(testGame.channel.sendMessageToPlayer.getCall($index).args[0]).to.equal(player);
            expect(testGame.channel.sendMessageToPlayer.getCall($index).args[1]).to.equal("init");
        });

        // First move
        const nextCall = players.length;
        expect(testGame.channel.sendMessageToPlayer.getCall(nextCall).args[0]).to.equal(players[0]);
        expect(testGame.channel.sendMessageToPlayer.getCall(nextCall).args[1]).to.equal("move");
    });

    it("accepts valid player moves", () => {
        const testGame = getGame();

        testGame.game.start();

        const firstMove = "0,0;1,1";

        testGame.game.onMessageFromPlayer(players[0], "0,0;1,1");

        expect(testGame.channel.sendMessageToPlayer.getCall(3).args[0]).to.equal(players[1]);
        expect(testGame.channel.sendMessageToPlayer.getCall(3).args[1]).to.equal(`opponent ${firstMove}`);

        testGame.game.onMessageFromPlayer(players[0], "1,1;0,1");
    });
});

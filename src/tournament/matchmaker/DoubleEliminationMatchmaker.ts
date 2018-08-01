import { RESULT_TIE } from "@socialgorithm/ultimate-ttt/dist/model/constants";

import Matchmaker from "./Matchmaker";
import Player from "../model/Player";
import { TournamentStats } from "../model/TournamentStats";
import MatchOptions from "../match/MatchOptions";
import DoubleEliminationMatch from "./DoubleEliminationMatch";
import Match from "../match/Match";

type PlayerStats = {
    player: Player;
    wins: number;
    losses: number;
}

type MatchingResult = {
    matches?: DoubleEliminationMatch[];
    oddPlayer?: Player;
}

/**
 * DoubleElimination is a strategy where each player plays atleast two games before
 * being eliminated.
 * 
 */
export default class DoubleEliminationMatchmaker implements Matchmaker {
    private finished: boolean;
    private tournamentStats: TournamentStats;
    private processedMatches: string[];
    private playerStats: { [key: string]: PlayerStats }
    private zeroLossOddPlayer: Player;
    private oneLossOddPlayer: Player;
    private waitingForFinal: Player[];
    private unlinkedMatches: DoubleEliminationMatch[] = [];

    constructor(private players: Player[], private options: MatchOptions, private sendStats: Function) {
        this.processedMatches = [];
        this.playerStats = {};
        this.players.forEach(player => {
            this.playerStats[player.token] = { player: player, wins: 0, losses: 0 };
        });
        this.waitingForFinal = [];
    }

    isFinished(): boolean {
        return this.finished;
    }

    getRemainingMatches(tournamentStats: TournamentStats): DoubleEliminationMatch[] {
        this.tournamentStats = tournamentStats
        
        let matches: DoubleEliminationMatch[] = [];

        if(tournamentStats.matches.length === 0) {
            const matchResult = this.matchPlayers(this.players);
            this.zeroLossOddPlayer = matchResult.oddPlayer;
            return matchResult.matches;
        }

        const justPlayedMatches = this.tournamentStats.matches.filter(match =>
            this.processedMatches.indexOf(match.uuid) === -1
        );

        const tiedPlayers: Player[] = [];

        justPlayedMatches.forEach((match: DoubleEliminationMatch) => {
                this.processedMatches.push(match.uuid);
                if(match.stats.winner === RESULT_TIE) {
                    matches.push(this.createMatch(match.players[0], match.players[1], { timeout: match.options.timeout / 2 }))
                    tiedPlayers.push(...match.players)
                } else {
                    const winnerToken = match.players[match.stats.winner].token;
                    const loserToken = match.players[match.stats.winner === 1 ? 0 : 1].token;
                    this.playerStats[winnerToken].wins++;
                    this.playerStats[loserToken].losses++;
                }
            }
        );

        if(matches.length < 1 && justPlayedMatches.length === 1 && this.waitingForFinal.length < 1) {
            this.finished = true;
            return [];
        }

        const zeroLossPlayers = [];
        const oneLossPlayers = [];
        for(const playerToken in this.playerStats) {
            const stats = this.playerStats[playerToken];
            if(!this.playerIsWaitingForMatch(stats.player) && tiedPlayers.indexOf(stats.player) === -1)
            if(stats.losses === 0) {
                zeroLossPlayers.push(stats.player);
            } else if(stats.losses === 1) {
                oneLossPlayers.push(stats.player);
            }
        }

        if(this.zeroLossOddPlayer != null) {
            zeroLossPlayers.unshift(this.zeroLossOddPlayer);
            delete this.zeroLossOddPlayer;
        }
        if(this.oneLossOddPlayer != null) {
            oneLossPlayers.unshift(this.oneLossOddPlayer);
            delete this.oneLossOddPlayer;
        }

        if(zeroLossPlayers.length > 1) {
            const matchResult = this.matchPlayers(zeroLossPlayers);
            matches.push(...matchResult.matches)
            this.zeroLossOddPlayer = matchResult.oddPlayer
        } else if(zeroLossPlayers.length === 1) {
            this.waitingForFinal.push(zeroLossPlayers[0]);
        }
        if(oneLossPlayers.length > 1) {
            const matchResult = this.matchPlayers(oneLossPlayers);
            matches.push(...matchResult.matches)
            this.oneLossOddPlayer = matchResult.oddPlayer
        } else if(oneLossPlayers.length === 1) {
            this.waitingForFinal.push(oneLossPlayers[0]);
        }

        if(tiedPlayers.length > 0) {

        }

        if(this.waitingForFinal.length > 1) {
            const matchResult = this.matchPlayers(this.waitingForFinal);
            matches.push(...matchResult.matches)
            this.waitingForFinal = [];
        }
        
        return matches;
    }

    private matchPlayers(players: Player[], optionOverrides?: any): MatchingResult {
        let matches: DoubleEliminationMatch[] = []; 
        let oddPlayer: Player;

        if(players.length < 2) {
            return {};
        }

        if(players.length % 2 !== 0) {
            oddPlayer = players[players.length-1]
            players = players.slice(0, -1);
        }

        for(let i = 0; i < players.length; i+=2) {
            const playerA = players[i];
            const playerB = players[i+1];
            matches.push(this.createMatch(playerA, playerB));
        }

        // set the parents for the new batch
        matches.forEach(match => {
            this.setParentMatches(match)
        });

        // store as unlinked
        this.unlinkedMatches.push(...matches);

        return { matches, oddPlayer }
    }

    private createMatch(playerA: Player, playerB: Player, optionOverrides?: any): DoubleEliminationMatch {
        const finalOptions = Object.assign(this.options, optionOverrides || {});
        return new DoubleEliminationMatch([playerA, playerB], finalOptions, this.sendStats)
    }

    private playerIsWaitingForMatch(player: Player): boolean {
        return this.waitingForFinal.indexOf(player) >= 0 || player === this.zeroLossOddPlayer || player === this.oneLossOddPlayer
    }

    private setParentMatches(match: DoubleEliminationMatch) {
        const playerTokens = match.players.map(player => player.token);
        
        // find out if this match came from another
        const parentMatches = this.unlinkedMatches.filter((match): boolean => {
            const winner = match.players[match.stats.winner];
            if (!winner) {
                return false;
            }
            return playerTokens.indexOf(winner.token) > -1;
        }).map(
            match => {
                const winner = match.players[match.stats.winner];
                return {
                    playerIndex: playerTokens.indexOf(winner.token),
                    parent: match.uuid,
                };
            }
        );

        parentMatches.forEach(matchParent => {
            const unlinkedIndex = this.unlinkedMatches.findIndex(eachMatch => eachMatch.uuid === matchParent.parent);
            this.unlinkedMatches.splice(unlinkedIndex, 1);
        });

        match.parentMatches = parentMatches;
    }

    getRanking(): string[] {
        return this.players
            .sort((a: Player, b: Player) => this.playerStats[b.token].wins - this.playerStats[a.token].wins)
            .map(player => player.token);
    }
}
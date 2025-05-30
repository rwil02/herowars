// ==UserScript==
// @name         Hero Wars Helper
// @namespace    http://l-space-design.com/
// @version      0.7
// @description  Get Hero Data for Hero Wars
// @author       Roger Willcocks
// @match        https://*.hero-wars.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=hero-wars.com
// @require      http://code.jquery.com/jquery-3.4.1.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';
    const base_Url = 'https://raw.githubusercontent.com/rwil02/herowars/main/';
    const resource_Url = base_Url + 'Resources/';
    const max_HistorySize = 700;
    const DEBUG = false;
    const INFO = true;
    const WARNING = true;

    try { GM_xmlhttpRequest = GM_xmlhttpRequest || this.GM_xmlhttpRequest; } catch (e) { GM_xmlhttpRequest = false; }

    var hw_HeroList = JSON.parse('[]');
    if (GM_xmlhttpRequest) {
        GM_xmlhttpRequest({
            method: "GET",
            url: resource_Url + "heros.json",
            headers: {
                "Accept": "text/json" // If not specified, browser defaults will be used.
            },
            responseType: "document",
            onload: function (response) {
                // Attempt to create responseXML, if absent, in supported browsers
                var responseText = response.responseText;
                if ((responseText) && (responseText.length > 2)) {
                    try {
                        hw_HeroList = JSON.parse(responseText);
                        debugLog("hw_HeroList.length: " + hw_HeroList.length);
                    }
                    catch (err) {
                        debugLog("hw_HeroList.failed - 1");
                    }
                } else {
                    debugLog("hw_HeroList.failed - 2");
                }

            }
        });
        GM_xmlhttpRequest({
            method: "GET",
            url: base_Url + "HeroWarsHelper.css",
            headers: {
                "Accept": "text/css" // If not specified, browser defaults will be used.
            },
            responseType: "document",
            onload: function (response) {
                var hw_css = '<style>\r\n';
                hw_css += response.responseText;
                hw_css += '\r\n</style>';
                jQuery("head").append(hw_css);
            }
        });
    }
    var hw_ArenaFindEnemies = null;
    var hw_GrandFindEnemies = null;
    var hw_GrandArenaHistory = JSON.parse(GM_getValue("hw_GrandArenaHistory", "[]"));
    var hw_ArenaHistory = JSON.parse(GM_getValue("hw_ArenaHistory", "[]"));
    var hw_UserId = Number.parseInt(GM_getValue("hw_UserId", ""));

    var hw_GA_Recommend = null;

    function debugLog(message) {
        if (!DEBUG) {
            return;
        }
        console.log(message);
    }
    function infoLog(message) {
        if (!INFO) {
            return;
        }
        console.log(message);
    }
    function warningLog(message) {
        if (!WARNING) {
            return;
        }
        console.log(message);
    }

    function getUserId(httpReq) {
        try {
            var x = Number.parseInt(httpReq._requestHeaders["X-Auth-Player-Id"]);
            if (!isNaN(x)) {
                if (x != hw_UserId) {
                    hw_UserId = x;
                    GM_setValue("hw_UserId", "" + hw_UserId)
                }
            }
        } catch (e) {
            console.error("getUserId: " + JSON.stringify(e));
        }
        return hw_UserId;
    }

    function isReady(httpReq) {
        if (!httpReq) {
            return false;
        }
        if (4 != httpReq.readyState) {
            return false;
        }
        if (200 != httpReq.status) {
            return false;
        }
        return true;
    }

    const calculateLevenshteinDistance = (a, b) => {
        const aLimit = a.length + 1;
        const bLimit = b.length + 1;
        const distance = Array(aLimit);
        for (let i = 0; i < aLimit; ++i) {
            distance[i] = Array(bLimit);
        }
        for (let i = 0; i < aLimit; ++i) {
            distance[i][0] = i;
        }
        for (let j = 0; j < bLimit; ++j) {
            distance[0][j] = j;
        }
        for (let i = 1; i < aLimit; ++i) {
            for (let j = 1; j < bLimit; ++j) {
                const substitutionCost = (a[i - 1] === b[j - 1] ? 0 : 1);
                distance[i][j] = Math.min(
                    distance[i - 1][j] + 1,
                    distance[i][j - 1] + 1,
                    distance[i - 1][j - 1] + substitutionCost
                );
            }
        }
        return distance[a.length][b.length];
    };

    function generateTeamKey(team) {
        if (!team) {
            return "";
        }
        var x = "";
        for (var i = 0; i < team.length; i++) {
            if (x.length > 0) {
                x += "|";
            }
            var member = team[i];
            if (!member.key) {
                member.key = generateTeamMember(member).key;
            }
            x += member.key;
        }
        return x;
    }

    function generateTeamMember(member) {
        var x = new Object();
        if (!member) {
            return x;
        }
        x.id = member.id;
        x.level = member.level;
        x.color = member.color;
        x.star = member.star;
        if (!member.petId) {
            x.petId = 0;
        } else {
            x.petId = member.petId;
        }
        x.key = "";
        x.key += x.id;
        x.key += "_";
        x.key += x.level;
        x.key += "_";
        x.key += x.color;
        x.key += "_";
        x.key += x.star;
        return x;
    }

    function generateTeam(team) {
        if (!team) {
            return new Array();
        }
        var x = new Array();
        var j = 0;
        for (const member in team) {
            var y = generateTeamMember(team[member]);
            if (y.id) {
                x[j] = y;
                j++;
            }
        }
        return x;
    }

    function getHeroName(heroid) {
        if (!heroid) {
            if (heroid == 0) {
                return heroid;
            }
            return "No ID passed";
        }
        if (!hw_HeroList) {
            return "No Heros: " + heroid;
        }
        for (var i = 0; i < hw_HeroList.length; i++) {
            var x = hw_HeroList[i];
            if (x.id == heroid) {
                return x.name ?? "No ID matched: " + heroid;
            }
        }
        return "No ID matched: " + heroid;
    }

    function getHeroImage(heroid) {
        if (!heroid) {
            if (heroid == 0) {
                return heroid;
            }
            return "No ID passed";
        }
        if (!hw_HeroList) {
            return "No Heros: " + heroid;
        }
        for (var i = 0; i < hw_HeroList.length; i++) {
            var x = hw_HeroList[i];
            if (x.id == heroid) {
                return resource_Url + (x.image ?? "No ID matched: " + heroid);
            }
        }
        return "No ID matched: " + heroid;
    }

    function getHeroFrameImage(color, id) {
        if (!color) {
            if (color == 0) {
                return color;
            }
            return "No color passed";
        }
        if (id > 5999) {
            return resource_Url + ("Frames/Hero_" + color + ".png");
        }
        return resource_Url + ("Frames/Hero_" + color + ".png");
    }

    function getHeroStarsImage(stars) {
        if (!stars) {
            if (stars == 0) {
                return stars;
            }
            return "No stars passed";
        }
        return resource_Url + ("stars_" + stars + ".png");

    }

    function htmlEncode(value) {
        return jQuery('<div/>').text(value).html();
    }

    function htmlDecode(value) {
        return jQuery('<div/>').html(value).text();
    }

    function displayDateTime(value) {
        if (!value) {
            return "";
        }
        const locale = null;
        const options = {
            day:"2-digit",
            month: "short",
            year:"numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        };
        try {
            return value.toLocaleString(locale, options);
        } catch {
            try {
                return value.toLocaleString();
            } catch { return value.toString(); }
        }
    }

    function createArenaBattleLog(originalLog, myUserId) {
        if (!originalLog) {
            return null;
        }
        var newLog = new Object();
        newLog.startTime = originalLog.startTime;
        if (myUserId == originalLog.userId) {
            newLog.opponentId = originalLog.typeId;
            newLog.type = "A";
            newLog.myTeam = generateTeam(originalLog.attackers);
            newLog.opponentTeam = generateTeam(originalLog.defenders[0]);
            newLog.win = originalLog.result.win;
        } else {
            if (myUserId != originalLog.typeId) {
                debugLog("Not defender or attacker: " + myUserId);
                return null;
            }
            newLog.opponentId = originalLog.userId;
            newLog.type = "D";
            newLog.myTeam = generateTeam(originalLog.defenders[0]);
            newLog.opponentTeam = generateTeam(originalLog.attackers);
            newLog.win = !originalLog.result.win;
        }
        newLog.myTeamKey = generateTeamKey(newLog.myTeam);
        newLog.opponentTeamKey = generateTeamKey(newLog.opponentTeam);

        return newLog;
    }

    function addArenaBattleLogIfNew(log, myUserId) {
        if (!log) {
            return;
        }
        var existingLog = null;

        for (var i = 0; i < hw_ArenaHistory.length; i++) {
            if (log.opponentId != hw_ArenaHistory[i].opponentId) {
                continue;
            }
            if (log.startTime != hw_ArenaHistory[i].startTime) {
                continue;
            }
            if (log.type != hw_ArenaHistory[i].type) {
                continue;
            }
            existingLog = hw_ArenaHistory[i];
        }
        if (null == existingLog) {
            if (hw_ArenaHistory.length > max_HistorySize) {
                hw_ArenaHistory.sort((a, b) => { return a.startTime - b.startTime; });
                if (hw_ArenaHistory[0].startTime > hw_ArenaHistory[hw_ArenaHistory.length - 1].startTime) {
                    hw_ArenaHistory.sort((a, b) => { return b.startTime - a.startTime; });
                    debugLog("Arena History Sort in wrong order, correcting");
                }
                while (hw_ArenaHistory.length > max_HistorySize) {
                    var ex = hw_ArenaHistory.shift();
                    infoLog("addArenaBattleLogIfNew Removing: " + ex.opponentId + ", " + displayDateTime(new Date(Number.parseInt(ex.startTime) * 1000)));
                }
            }
            existingLog = new Object();
            existingLog.startTime = log.startTime;
            existingLog.type = log.type;
            existingLog.opponentId = log.opponentId;
            existingLog.battles = new Array();
            hw_ArenaHistory.push(existingLog);
        }
        var winCount = 0;
        for (var j = 0; j < existingLog.battles.length; j++) {
            var battle = existingLog.battles[j];
            if (battle.win) {
                winCount += 1;
            }
            if (battle.opponentTeamKey != log.opponentTeamKey) {
                continue;
            }
            if (battle.myTeamKey != log.myTeamKey) {
                continue;
            }
            return;
        }
        existingLog.battles.push(log);
        if (log.win) {
            winCount += 1;
        }
        existingLog.win = winCount > 0;

        GM_setValue("hw_ArenaHistory", JSON.stringify(hw_ArenaHistory));
        debugLog("hw_ArenaHistory.length: " + hw_ArenaHistory.length);
    }

    function createGrandArenaBattleLog(originalLog, myUserId) {
        if (!originalLog) {
            return null;
        }
        var newLog = new Object();
        newLog.startTime = originalLog.startTime;
        if (myUserId == originalLog.userId) {
            newLog.opponentId = originalLog.typeId;
            newLog.type = "A";
            newLog.myTeam = generateTeam(originalLog.attackers);
            newLog.opponentTeam = generateTeam(originalLog.defenders[0]);
            newLog.win = originalLog.result.win;
        } else {
            if (myUserId != originalLog.typeId) {
                debugLog("Not defender or attacker: " + myUserId);
                return null;
            }
            newLog.opponentId = originalLog.userId;
            newLog.type = "D";
            newLog.myTeam = generateTeam(originalLog.defenders[0]);
            newLog.opponentTeam = generateTeam(originalLog.attackers);
            newLog.win = !originalLog.result.win;
        }
        newLog.myTeamKey = generateTeamKey(newLog.myTeam);
        newLog.opponentTeamKey = generateTeamKey(newLog.opponentTeam);

        return newLog;
    }

    function addGrandArenaBattleLogIfNew(log, myUserId) {
        if (!log) {
            return;
        }
        var existingLog = null;

        for (var i = 0; i < hw_GrandArenaHistory.length; i++) {
            if (log.opponentId != hw_GrandArenaHistory[i].opponentId) {
                continue;
            }
            if (log.startTime != hw_GrandArenaHistory[i].startTime) {
                continue;
            }
            if (log.type != hw_GrandArenaHistory[i].type) {
                continue;
            }
            existingLog = hw_GrandArenaHistory[i];
        }
        if (null == existingLog) {
            if (hw_GrandArenaHistory.length > max_HistorySize) {
                hw_GrandArenaHistory.sort((a, b) => { return a.startTime - b.startTime; });
                if (hw_GrandArenaHistory[0].startTime > hw_GrandArenaHistory[hw_GrandArenaHistory.length - 1].startTime) {
                    hw_GrandArenaHistory.sort((a, b) => { return b.startTime - a.startTime; });
                    debugLog("Grand Arena History Sort in wrong order, correcting");
                }
                while (hw_GrandArenaHistory.length > max_HistorySize) {
                    var ex = hw_GrandArenaHistory.shift();
                    debugLog("addGrandArenaBattleLogIfNew Removing: " + ex.opponentId + ", " + displayDateTime(new Date(Number.parseInt(ex.startTime) * 1000)));
                }
            }
            existingLog = new Object();
            existingLog.startTime = log.startTime;
            existingLog.type = log.type;
            existingLog.opponentId = log.opponentId;
            existingLog.battles = new Array();
            hw_GrandArenaHistory.push(existingLog);
        }
        var winCount = 0;
        for (var j = 0; j < existingLog.battles.length; j++) {
            var battle = existingLog.battles[j];
            if (battle.win) {
                winCount += 1;
            }
            if (battle.opponentTeamKey != log.opponentTeamKey) {
                continue;
            }
            if (battle.myTeamKey != log.myTeamKey) {
                continue;
            }
            return;
        }
        existingLog.battles.push(log);
        if (log.win) {
            winCount += 1;
        }
        existingLog.win = winCount > 1;

        GM_setValue("hw_GrandArenaHistory", JSON.stringify(hw_GrandArenaHistory));
        debugLog("hw_GrandArenaHistory.length: " + hw_GrandArenaHistory.length);
    }

    function hideRecommendation() {
        if (!hw_GA_Recommend) {
            return;
        }
        hw_GA_Recommend.hide();
    }

    function getGrandArenaRecommendation(enemy) {
        var result = new Object();
        if (enemy.user) {
            result.userId = enemy.user.id;
            result.userName = enemy.user.name;
        } else {
            result.userId = 0;
            result.userName = "Missing User";
        }
        result.place = enemy.place;
        result.opponentTeams = new Array();
        debugLog("getGrandArenaRecommendation");
        debugLog(enemy);
        if (enemy.heroes) {
            for (var j = 0; j < enemy.heroes.length; j++) {
                result.opponentTeams.push(generateTeam(enemy.heroes[j]));
            }
        }
        var battles = new Array();
        var winCount = 0;
        for (var i = 0; i < hw_GrandArenaHistory.length; i++) {
            var battle = hw_GrandArenaHistory[i];
            if (battle.type != 'A') {
                continue;
            }
            if (battle.opponentId != result.userId) {
                continue;
            }
            battles.push(battle);
            if (battle.win) {
                winCount++;
            }
        }
        battles.sort((a, b) => { b.startTime - a.startTime });
        result.battles = battles.sort((a, b) => { return b.startTime - a.startTime; });
        if (result.battles && result.battles.length) {
            result.winPercent = winCount / battles.length;
            result.wins = winCount + " / " + battles.length;
        } else {
            result.wins = "";
            result.winPercent = 0;
        }

        return result;
    }

    function getArenaRecommendation(enemy) {
        var result = new Object();
        result.userId = enemy.user.id;
        result.userName = enemy.user.name;
        result.place = enemy.place;
        result.opponentTeams = new Array();
        debugLog("getArenaRecommendation");
        debugLog(enemy);
        if (enemy.heroes) {
            result.opponentTeams.push(generateTeam(enemy.heroes));
        }
        var battles = new Array();
        var winCount = 0;
        for (var i = 0; i < hw_ArenaHistory.length; i++) {
            var battle = hw_ArenaHistory[i];
            if (battle.type != 'A') {
                continue;
            }
            if (battle.opponentId != result.userId) {
                continue;
            }
            battles.push(battle);
            if (battle.win) {
                winCount++;
            }
        }
        battles.sort((a, b) => { b.startTime - a.startTime });
        result.battles = battles.sort((a, b) => { return b.startTime - a.startTime; });
        if (result.battles && result.battles.length) {
            result.winPercent = winCount / battles.length;
            result.wins = winCount + " / " + battles.length;
        } else {
            result.wins = "";
            result.winPercent = 0;
        }

        return result;
    }

    function displayGrandArenaRecommendation(container, recommendation, opponentTeams) {
        if (!container) {
            warningLog("displayGrandArenaRecommendation - no container");
            return;
        }
        if (!recommendation) {
            warningLog("displayGrandArenaRecommendation - no recommendation");
            return;
        }
        if (!recommendation.battles) {
            warningLog("displayGrandArenaRecommendation - no battles");
            return;
        }
        if (!recommendation.battles.length) {
            return;
        }
        var content = jQuery('<table />');
        for (var i = 0; i < recommendation.battles.length; i++) {
            if (i >= 5) {
                break;
            }
            var battle = recommendation.battles[i];
            var when = displayDateTime(new Date(Number.parseInt(battle.startTime) * 1000));
            var tr = jQuery('<tr />');
            if (battle.win) {
                tr.addClass("hw-recommendation-win");
            } else {
                tr.addClass("hw-recommendation-lose");
            }
            var th = jQuery('<th colspan="2" class="hw-recommendation"></th>');
            th.text(when);
            tr.append(th);
            content.append(tr);
            for (var j = 0; j < battle.battles.length; j++) {
                var thisBattle = battle.battles[j];
                tr = jQuery('<tr />');
                if (thisBattle.win) {
                    tr.addClass("hw-recommendation-win");
                } else {
                    tr.addClass("hw-recommendation-lose");
                }
                var td = jQuery('<td />');
                for (var l = thisBattle.myTeam.length; l--; l >= 0) {
                    td.append(buildHeroDisplay(thisBattle.myTeam[l], true));
                }
                tr.append(td);
                td = jQuery('<td />');
                var team = getBestMatchingTeam(opponentTeams, thisBattle.opponentTeamKey);
                if ((!team) || (team.key != thisBattle.opponentTeamKey)) {
                    td.addClass("hw-recommendation-unmatched");
                }
                for (var k = 0; k < thisBattle.opponentTeam.length; k++) {
                    var opponentHero = thisBattle.opponentTeam[k];
                    var hero = getBestMatchingHero(team, opponentHero.key);
                    if (!hero) {
                        hero = false;
                    }
                    td.append(buildHeroDisplay(opponentHero, hero.key == opponentHero.key));
                }
                tr.append(td);
                content.append(tr);
            }
            if (i > 10) {
                break;
            }
        }
        container.append(content);
    }

    function displayArenaRecommendation(container, recommendation) {
        if (!container) {
            warningLog("displayArenaRecommendation - no container");
            return;
        }
        if (!recommendation) {
            warningLog("displayArenaRecommendation - no recommendation");
            return;
        }
        if (!recommendation.battles) {
            warningLog("displayArenaRecommendation - no battles");
            return;
        }
        if (!recommendation.battles.length) {
            return;
        }
        var content = jQuery('<table />');
        for (var i = 0; i < recommendation.battles.length; i++) {
            if (i >= 5) {
                break;
            }
            var battle = recommendation.battles[i];
            var when = displayDateTime(new Date(Number.parseInt(battle.startTime) * 1000));
            var tr = jQuery('<tr />');
            if (battle.win) {
                tr.addClass("hw-recommendation-win");
            } else {
                tr.addClass("hw-recommendation-lose");
            }
            var th = jQuery('<th colspan="2" class="hw-recommendation"></th>');
            th.text(when);
            tr.append(th);
            content.append(tr);
            for (var j = 0; j < battle.battles.length; j++) {
                var thisBattle = battle.battles[j];
                tr = jQuery('<tr />');
                if (thisBattle.win) {
                    tr.addClass("hw-recommendation-win");
                } else {
                    tr.addClass("hw-recommendation-lose");
                }
                var td = jQuery('<td />');
                for (var l = thisBattle.myTeam.length; l--; l >= 0) {
                    td.append(buildHeroDisplay(thisBattle.myTeam[l], true));
                }
                tr.append(td);
                td = jQuery('<td />');
                var team = getBestMatchingTeam(recommendation.opponentTeams, thisBattle.opponentTeamKey);
                if ((!team) || (team.key != thisBattle.opponentTeamKey)) {
                    td.addClass("hw-recommendation-unmatched");
                }
                for (var k = 0; k < thisBattle.opponentTeam.length; k++) {
                    var opponentHero = thisBattle.opponentTeam[k];
                    var hero = getBestMatchingHero(team, opponentHero.key);
                    if (!hero) {
                        hero = false;
                    }
                    td.append(buildHeroDisplay(opponentHero, hero.key == opponentHero.key));
                }
                tr.append(td);
                content.append(tr);
            }
            if (i > 10) {
                break;
            }
        }
        container.append(content);
    }

    function mapColor(colorId) {
        switch (colorId) {
            case 1:
                return 'White';
            case 2:
                return 'Green';
            case 3:
                return 'Green+1';
            case 4:
                return 'Blue';
            case 5:
                return 'Blue+1';
            case 6:
                return 'Blue+2';
            case 7:
                return 'Violet';
            case 8:
                return 'Violet+1';
            case 9:
                return 'Violet+2';
            case 10:
                return 'Violet+3';
            case 11:
                return 'Orange';
            case 12:
                return 'Orange+1';
            case 13:
                return 'Orange+2';
            case 14:
                return 'Orange+3';
            case 15:
                return 'Orange+4';
            case 16:
                return 'Red';
            case 17:
                return 'Red+1';
            case 18:
                return 'Red+2';
        }
        return "Unknown: " + colorId;
    }

    function buildHeroDisplay(hero, isMatched) {
        if (!hero) {
            return "No Hero";
        }
        var content = '<span style="background-image:url(\'';
        content += htmlEncode(getHeroImage(hero.id));
        content += '\');" class="hw-battle-hero-icon" />';

        var result = jQuery(content);
        if (!isMatched) {
            result.addClass("hw-recommendation-unmatched");
        }
        content = '<img src="';
        content += htmlEncode(getHeroStarsImage(hero.star));
        content += '" style="background-image: url(\'';
        content += htmlEncode(getHeroFrameImage(hero.color, hero.id));
        content += '\')';
        content += '" class="hw-battle-hero-icon" title="';
        content += htmlEncode(getHeroName(hero.id));
        content += ' - L:' + hero.level;
        content += ', S:' + hero.star;
        content += ', C:' + htmlEncode(mapColor(hero.color));
        content += '" />';
        result.append(content);
        return result;
    }

    function getBestMatchingTeam(teams, key) {
        if (!key) {
            debugLog("getBestMatchingTeam - no key");
            return null;
        }
        debugLog("getBestMatchingTeam - " + key);
        if (!teams) {
            debugLog("getBestMatchingTeam - no team");
            return null;
        }
        debugLog("getBestMatchingTeam - has team");
        if (!teams.length) {
            debugLog("getBestMatchingTeam - team empty");
            return null;
        }
        debugLog("getBestMatchingTeam - start loop");
        var bestTeam = teams[0];
        var bestScore = 999999999;
        for (var i = 0; i < teams.length; i++) {
            if (!teams[i].key) {
                teams[i].key = generateTeamKey(teams[i]);
            }
            debugLog(teams[i].key);
            if (teams[i].key == key) {
                return teams[i];
            }
            var newScore = calculateLevenshteinDistance(teams[i].key, key);
            if (newScore < bestScore) {
                debugLog("Better - " + teams[i].key);
                bestScore = newScore;
                bestTeam = teams[i];
            }
        }
        return bestTeam;
    }

    function getBestMatchingHero(heros, key) {
        if (!key) {
            debugLog("getBestMatchingHero - no key");
            return null;
        }
        debugLog("getBestMatchingHero - " + key);
        if (!heros) {
            debugLog("getBestMatchingHero - no heros");
            return null;
        }
        debugLog("getBestMatchingHero - has heros");
        if (!heros.length) {
            debugLog("getBestMatchingHero - heros empty");
            return null;
        }
        debugLog("getBestMatchingHero - start loop");
        var bestHero = heros[0];
        var bestScore = 999999999;
        for (var i = 0; i < heros.length; i++) {
            debugLog(heros[i].key);
            if (heros[i].key == key) {
                return heros[i];
            }
            var newScore = calculateLevenshteinDistance(heros[i].key, key);
            if (newScore < bestScore) {
                debugLog("Better - " + heros[i].key);
                bestScore = newScore;
                bestHero = heros[i];
            }
        }
        return bestHero;
    }

    function setupGrandArenaRecommendations(enemies) {
        hideRecommendation();
        if (!enemies || !enemies.length) {
            return;
        }
        debugLog("setupGrandArenaRecommendations");
        debugLog(enemies);
        var results = new Array();
        for (var i = 0; i < enemies.length; i++) {
            results.push(getGrandArenaRecommendation(enemies[i]));
        }
        debugLog(results);
        if (!hw_GA_Recommend) {
            hw_GA_Recommend = jQuery('<div class="hw-recommendation-head">HERE WE GO</div>');
            jQuery('main.layout_content').prepend(hw_GA_Recommend);
        }
        hw_GA_Recommend.empty();
        var t = jQuery('<table class="hw-recommendation"></table>');
        hw_GA_Recommend.append(t);
        var thead = jQuery("<thead></thead>");
        t.append(thead);
        setupRecommendationsHeaders(results, thead);
        setupRecommendationsDisplay(results, displayGrandArenaRecommendation);
        hw_GA_Recommend.show();
    }

    function setupArenaRecommendations(enemies) {
        hideRecommendation();
        debugLog(enemies);
        if (!enemies || !enemies.length) {
            debugLog("setupArenaRecommendations - invalid");
            return;
        }
        debugLog("setupArenaRecommendations - incomplete");
        //return;
        var results = new Array();
        for (var i = 0; i < enemies.length; i++) {
            results.push(getArenaRecommendation(enemies[i]));
        }
        debugLog(results);
        if (!hw_GA_Recommend) {
            hw_GA_Recommend = jQuery('<div class="hw-recommendation-head">HERE WE GO</div>');
            jQuery('main.layout_content').prepend(hw_GA_Recommend);
        }
        hw_GA_Recommend.empty();

        var t = jQuery('<table class="hw-recommendation"></table>');
        hw_GA_Recommend.append(t);
        var thead = jQuery('<thead></thead>');
        t.append(thead);
        setupRecommendationsHeaders(results, thead);
        setupRecommendationsDisplay(results, displayArenaRecommendation);
        hw_GA_Recommend.show();
    }
    function setupRecommendationsDisplay(results, displayRecommendationFunc) {
        for (var j = 0; j < results.length; j++) {
            var div = jQuery('<div class="hw-recommendation"></div>');
            var me = results[j];
            displayRecommendationFunc(div, me);
            hookupShowRecommendation(me, me.header, div, results);
            hw_GA_Recommend.append(div);
            div.hide();
        }
    }

    function setupRecommendationsHeaders(results, thead) {
        for (var k = 0; k < results.length; k++) {
            var tr = jQuery('<tr></tr>');
            var th = jQuery('<th class="hw-recommendation" style="text-align:left;white-space:nowrap;min-width:40px;"></th>');
            var winStyle = '';
            if (results[k].winPercent > 0.5) {
                winStyle = "#204020";
                if (results[k].winPercent > 0.75) {
                    winStyle = "#206020";
                    if (results[k].winPercent > 0.85) {
                        winStyle = "#208020";
                    }
                }
            };
            var txt = results[k].wins;
            th.text(txt);
            if (winStyle.length > 2) {
                th.css("background-color", winStyle);
            }
            tr.append(th);
            th = jQuery('<th class="hw-recommendation" style="width:100%;"></th>');
            txt = results[k].userName;
            th.text(txt);
            if (winStyle.length > 2) {
                th.css("background-color", winStyle);
            }
            tr.append(th);

            th = jQuery('<th class="hw-recommendation" style="text-align:right;white-space:nowrap;min-width:40px;"></th>');
            txt = ' ';
            if (results[k].place) {
                txt = "[" + results[k].place + "]";
            }
            th.text(txt);
            if (winStyle.length > 2) {
                th.css("background-color", winStyle);
            }
            tr.append(th);
            results[k].header = tr;
            thead.append(tr);
        }
    }
    function hookupShowRecommendation(me, header, body, allResults) {
        me.body = body;
        header.click(function () {
            for (var i = 0; i < allResults.length; i++) {
                allResults[i].body.hide();
                allResults[i].header.css('background-color', '');
            }
            body.show();
            header.css('background-color', '#333333');
        });

        setTimeout(function () { body.hide(); header.hide(); }, 90000);
    }

    function extractResults(httpReq) {
        var jsonObj = getJsonObject(httpReq);
        if (!jsonObj) { return null; }
        debugLog(jsonObj);
        if (!jsonObj.results) { return null; }
        return jsonObj.results;
    }

    function extractResultsArray(httpReq) {
        var result = extractResults(httpReq);
        if (!result) { return null; }
        if (!result.length) { return null; }
        return result;
    }

    function extractResultsByIdent(result, ident) {
        if (!result) {
            debugLog("extractResultsByIdent - no result");
            return null;
        }
        if (!ident) {
            debugLog("extractResultsByIdent - no ident");
            return null;
        }
        for (var j = 0; j < result.length; j++) {
            if (result[j].ident == ident) {
                return result[j].result;
            }
        }
        debugLog("extractResultsByIdent - no match");
        return null;
    }

    function extractGrandArenaEnemies(jsonObj) {
        if ((!jsonObj)) {
            debugLog("extractGrandArenaEnemies - no results");
            return null;
        }
        var x = jsonObj.response;
        if (!x) {
            debugLog("extractGrandArenaEnemies - no response");
            return null;
        }
        if (!x.length) {
            debugLog("extractGrandArenaEnemies - no response length");
            return null;
        }
        if (!x[0].userId) {
            debugLog("extractGrandArenaEnemies - no user id");
            return null;
        }
        var place = parseInt(x[0].place);
        if (!place) {
            debugLog("extractGrandArenaEnemies - no place");
            return null;
        }
        if (!x[0].heroes) {
            debugLog("extractGrandArenaEnemies - no heroes");
            return null;
        }
        if (x[0].heroes.length != 3) {
            if (place > 100) {
                debugLog("extractGrandArenaEnemies - wrong number of teams");
                return null;
            }
        }
        if (!x[0].heroes[0].length) {
            if (place > 10) {
                debugLog("extractGrandArenaEnemies - no heroes in teams");
                return null;
            }
        }
        return x;
    }

    function extractArenaEnemies(jsonObj) {
        if ((!jsonObj)) {
            debugLog("extractArenaEnemies - no results");
            return null;
        }
        var x = jsonObj.response;
        if (!x) {
            debugLog("extractArenaEnemies - no response");
            return null;
        }
        if (!x.length) {
            debugLog("extractArenaEnemies - no response length");
            return null;
        }
        if (!x[0].heroes) {
            debugLog("extractArenaEnemies - no heroes");
            return null;
        }
        if ((x[0].heroes.length < 1) || (x[0].heroes.length > 6)) {
            debugLog("extractArenaEnemies - wrong number of heroes");
            return null;
        }
        if (!x[0].place) {
            debugLog("extractArenaEnemies - no place");
            return null;
        }
        if (!x[0].userId) {
            debugLog("extractArenaEnemies - no user id");
            return null;
        }
        return x;
    }

    function getJsonObject(httpReq) {
        try {
            if (httpReq.responseType == "json") {
                return httpReq.response;   // FF code.  Chrome??
            }
            var decodedString = null;
            if (httpReq.responseType == "arraybuffer") {
                if (httpReq.response.byteLength < 100000) {
                    decodedString = String.fromCharCode.apply(null, new Uint8Array(httpReq.response)).trim();
                    if (decodedString.length > 0 && decodedString[0] == '{') {
                        return JSON.parse(decodedString);   // FF code.  Chrome??
                    }
                }
                return null
            }
            if (!httpReq.responseText) {
                return null;
            }
            decodedString = httpReq.responseText.trim();
            if (decodedString.length > 0 && decodedString[0] == '{') {
                return JSON.parse(decodedString);   // FF code.  Chrome??
            }
        }
        catch (err) {
            debugLog(err);
        }
        return null;
    }

    function grandFindEnemiesHookup(httpReq, ident) {
        if (!ident) {
            debugLog("grandFindEnemies - ident NULL");
            return;
        }
        hw_ArenaFindEnemies = '';
        hw_GrandFindEnemies = '';
        httpReq.addEventListener("readystatechange", function (evt) {
            if (!isReady(this)) {
                return;
            }
            debugLog("grandFindEnemies - ready");
            var jsonObj = extractResultsArray(this);
            if (!jsonObj) { return; }

            var x = extractResultsByIdent(jsonObj, ident);
            debugLog(x);
            if (!x) {
                debugLog("grandFindEnemiesHookup: results not found");
                return;
            }
            var result = extractGrandArenaEnemies(x);
            if (result) {
                hw_GrandFindEnemies = result;
                setupGrandArenaRecommendations(hw_GrandFindEnemies);
                return;
            }
        });
    }

    function arenaFindEnemiesHookup(httpReq, ident) {
        if (!ident) {
            debugLog("arenaFindEnemies - ident NULL");
            return;
        }
        hw_ArenaFindEnemies = '';
        hw_GrandFindEnemies = '';
        httpReq.addEventListener("readystatechange", function (evt) {
            if (!isReady(this)) {
                return;
            }
            debugLog("arenaFindEnemies - ready");
            var jsonObj = extractResultsArray(this);
            if (!jsonObj) { return; }

            var x = extractResultsByIdent(jsonObj, ident);
            debugLog(x);
            if (!x) {
                debugLog("arenaFindEnemiesHookup: results not found");
                return;
            }
            var result = extractArenaEnemies(x);
            if (result) {
                hw_ArenaFindEnemies = result;
                setupArenaRecommendations(hw_ArenaFindEnemies);
                return;
            }
        });
    }

    function callTypeHookup(httpReq, call_id, ident) {
        if (!call_id) {
            debugLog("call_id NULL");
            return;
        }
        if (!ident) {
            debugLog(call_id + " - ident NULL");
            return;
        }
        httpReq.addEventListener("readystatechange", function (evt) {
            if (!isReady(this)) {
                return;
            }
            var jsonObj = extractResultsArray(this);
            if (!jsonObj) { return; }

            var x = extractResultsByIdent(jsonObj, ident);
            debugLog(call_id);
            debugLog(x);
       });
    }

    function battleGetByTypeHookup(httpReq, ident) {
        if (!ident) {
            debugLog("battleGetByType - ident NULL");
            return;
        }
        httpReq.addEventListener("readystatechange", function (evt) {
            if (!isReady(this)) {
                return;
            }
            debugLog("battleGetByType - ready");
            var jsonObj = extractResultsArray(this);
            if (!jsonObj) { return; }

            var x = extractResultsByIdent(jsonObj, ident);
            debugLog(x);
            if (!x) {
                debugLog("battleGetByTypeHookup: results not found");
                return;
            }
            if (!x.response) {
                debugLog("battleGetByTypeHookup: results.response not found");
                return;
            }
            x = x.response;
            if (!x.replays) {
                debugLog("battleGetByTypeHookup: results.response.replays not found");
                return;
            }
            x = x.replays;
            for (var j = 0; j < x.length; j++) {
                switch (x[j].type) {
                    case "arena":
                        addArenaBattleLogIfNew(createArenaBattleLog(x[j], getUserId(httpReq)), getUserId(httpReq));
                        break;
                    case "grand":
                        addGrandArenaBattleLogIfNew(createGrandArenaBattleLog(x[j], getUserId(httpReq)), getUserId(httpReq));
                        break;
                    default:
                        debugLog("battleGetByTypeHookup: unknown type [" + x[j].type + "]");
                        break;
                }
            }
        });
    }

    (function (send) {
        XMLHttpRequest.prototype.send = function (data) {
            try {
                if (!data) {
                    return;
                }
                var dataStr = null;
                if (typeof data === "string") {
                    dataStr = data.trim();
                } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
                    dataStr = String.fromCharCode.apply(null, new Uint8Array(data)).trim();
                }
                if (!(dataStr && dataStr.length > 5)) {
                    return;
                }
                if (dataStr[0] != '{') {
                    if (dataStr[0] != '[') {
                        return;
                    }
                }
                var calls = JSON.parse(dataStr);
                if ((calls.calls) && (calls.calls.length)) {
                    calls = calls.calls;
                }
                if (!calls.length) {
                    debugLog('Entered send with no calls');
                    return;
                }
                for (var i = 0; i < calls.length; i++) {
                    var name = calls[i].name;
                    var ident = calls[i].ident;
                    var handled = false;
                    debugLog('Entered send - ' + name + " / " + ident);
                    switch (name) {
                        case "grandFindEnemies":
                            grandFindEnemiesHookup(this, ident);
                            handled = true;
                            break;
                        case "arenaFindEnemies":
                            arenaFindEnemiesHookup(this, ident);
                            handled = true;
                            break;
                        case "battleGetByType":
                            battleGetByTypeHookup(this, ident);
                            handled = true;
                            break;
                        case "grandAttack":
                            hideRecommendation();
                            break;
                        case "arenaAttack":
                            hideRecommendation();
                            break;
                        case "heroGetAll":
                            break;//heroGetAll
                        case "pet_getAll":
                            break;//pet_getAll
                        case "userMergeGetStatus":
                            break;//body
                        case "registration":
                            break;//body
                        case "freebieCheck":
                            break;//freebieCheck
                        case "userGetInfo":
                            break;//userGetInfo
                        case "friendsGetInfo":
                            break;//friendsGetInfo
                        case "billingGetAll":
                            break;//billingGetAll
                        case "inventoryGet":
                            break;//inventoryGet
                        case "titanGetAll":
                            break;//titanGetAll
                        case "titanSpiritGetAll":
                            break;//titanSpiritGetAll
                        case "pet_getPotionDailyBuyCount":
                            break;//pet_getPotionDailyBuyCount
                        case "missionGetAll":
                            break;//missionGetAll
                        case "missionGetReplace":
                            break;//missionGetReplace
                        case "dailyBonusGetInfo":
                            break;//dailyBonusGetInfo
                        case "getTime":
                            break;//getTime
                        case "teamGetAll":
                            break;//teamGetAll
                        case "teamGetFavor":
                            break;//teamGetFavor
                        case "questGetAll":
                            break;//questGetAll
                        case "questGetEvents":
                            break;//questGetEvents
                        case "mailGetAll":
                            break;//mailGetAll
                        case "arenaGetAll":
                            break;//arenaGetAll
                        case "socialQuestGetInfo":
                            break;//socialQuestGetInfo
                        case "userGetAvailableAvatars":
                            break;//userGetAvailableAvatars
                        case "userGetAvailableAvatarFrames":
                            break;//userGetAvailableAvatarFrames
                        case "userGetAvailableStickers":
                            break;//userGetAvailableStickers
                        case "settingsGetAll":
                            break;//settingsGetAll
                        case "subscriptionGetInfo":
                            break;//subscriptionGetInfo
                        case "zeppelinGiftGet":
                            break;//zeppelinGiftGet
                        case "tutorialGetInfo":
                            break;//tutorialGetInfo
                        case "offerGetAll":
                            break;//offerGetAll
                        case "splitGetAll":
                            break;//splitGetAll
                        case "billingGetLast":
                            break;//billingGetLast
                        case "artifactGetChestLevel":
                            break;//artifactGetChestLevel
                        case "titanArtifactGetChest":
                            break;//titanArtifactGetChest
                        case "titanGetSummoningCircle":
                            break;//titanGetSummoningCircle
                        case "newYearGetInfo":
                            break;//newYearGetInfo
                        case "clanWarGetBriefInfo":
                            break;//clanWarGetBriefInfo
                        case "towerGetInfo":
                            break;//towerGetInfo
                        case "clanWarGetWarlordInfo":
                            break;//clanWarGetWarlordInfo
                        case "campaignStoryGetList":
                            break;//campaignStoryGetList
                        case "roleAscension_getAll":
                            break;//roleAscension_getAll
                        case "chatGetAll":
                            break;//chatGetAll
                        case "chatGetTalks":
                            break;//chatGetTalks
                        case "chatGetInfo":
                            break;//chatGetInfo
                        case "clanGetInfo":
                            break;//clanGetInfo
                        case "clanGetActivityRewardTable":
                            break;//clanGetActivityRewardTable
                        case "clanGetPrevData":
                            break;//clanGetPrevData
                        case "heroesMerchantGet":
                            break;//heroesMerchantGet
                        case "freebieHaveGroup":
                            break;//freebieHaveGroup
                        case "pirateTreasureIsAvailable":
                            break;//pirateTreasureIsAvailable
                        case "expeditionGet":
                            break;//expeditionGet
                        case "hallOfFameGetTrophies":
                            break;//hallOfFameGetTrophies
                        case "titanArenaCheckForgotten":
                            break;//titanArenaCheckForgotten
                        case "titanArenaGetChestReward":
                            break;//titanArenaGetChestReward
                        case "bossGetAll":
                            break;//bossGetAll
                        case "shopGetAll":
                            break;//shopGetAll
                        case "adventure_getPassed":
                            break;//adventure_getPassed
                        case "adventure_getActiveData":
                            break;//adventure_getActiveData
                        case "adventure_find":
                            break;//adventure_find
                        case "adventureSolo_getActiveData":
                            break;//adventureSolo_getActiveData
                        case "pet_getChest":
                            break;//pet_getChest
                        case "playable_getAvailable":
                            break;//playable_getAvailable
                        case "battlePass_getInfo":
                            break;//battlePass_getInfo
                        case "clanRaid_ratingInfo":
                            break;//clanRaid_ratingInfo
                        case "clanRaid_getInfo":
                            break;//clanRaid_getInfo
                        case "coopBundle_getInfo":
                            break;//coopBundle_getInfo
                        case "buffs_getInfo":
                            break;//buffs_getInfo
                        case "brawl_getInfo":
                            break;//brawl_getInfo
                        case "brawl_questGetInfo":
                            break;//brawl_questGetInfo
                        case "mechanicAvailability":
                            break;//mechanicAvailability
                        case "socialQuestPost":
                            break;//socialQuestPost
                        case "socialQuestGroupJoin":
                            break;//socialQuestGroupJoin
                        case "socialQuestPost":
                            break;//socialQuestPost
                        case "socialQuestGroupJoin":
                            break;//socialQuestGroupJoin
                        case "invasion_getInfo":
                            break;//invasion_getInfo
                    }
                    if (!handled) {
                        callTypeHookup(this, name, ident);
                    }
                }
            }
            catch (e) {
                console.error(e);
            }
            finally {
                send.call(this, data);
            }
        };
    })(XMLHttpRequest.prototype.send);

})();
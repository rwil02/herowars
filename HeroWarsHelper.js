// ==UserScript==
// @name         Hero Wars Helper
// @namespace    http://l-space-design.com/
// @version      0.4
// @description  Get Hero Data for Hero Wars
// @author       Roger Willcocks
// @match        https://*.hero-wars.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=hero-wars.com
// @require      http://code.jquery.com/jquery-3.4.1.min.js
// @resource     HERO_LIST https://raw.githubusercontent.com/rwil02/herowars/main/Resources/heros.json
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_getResourceText
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';
    const base_Url = 'https://raw.githubusercontent.com/rwil02/herowars/main/Resources/';

    try { GM_xmlhttpRequest = GM_xmlhttpRequest || this.GM_xmlhttpRequest; } catch (e) { GM_xmlhttpRequest = false; }

    var hw_HeroList = JSON.parse('[]');
    if (GM_xmlhttpRequest) {
        GM_xmlhttpRequest({
            method: "GET",
            url: base_Url + "heros.json",
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
    }
    var hw_HeroGetAll = null;
    var hw_PetGetAll = null;
    var hw_ArenaFindEnemies = null;
    var hw_GrandFindEnemies = null;
    var hw_GrandArenaHistory = JSON.parse(GM_getValue("hw_GrandArenaHistory", "[]"));
    var hw_ArenaHistory = JSON.parse(GM_getValue("hw_ArenaHistory", "[]"));
    var hw_UserId = Number.parseInt(GM_getValue("hw_UserId", ""));

    var hw_GA_Recommend = null;
    function loadCss() {
        var hw_css = '<style>\r\n';

        hw_css += 'div.hw-recommendation-head {\r\n';
        hw_css += 'text-align:center;\r\nwidth:520px;\r\npadding:5px;\r\n';
        hw_css += 'position:absolute;\r\ntop:50px;\r\nright:5px;z-index:999;\r\n';
        hw_css += '}\r\n';
        hw_css += 'table.hw-recommendation {\r\n';
        hw_css += 'margin: 0 auto;border:0;color:white;width:510px;"\r\n';
        hw_css += '}\r\n';
        hw_css += 'tr.hw-recommendation-win {\r\n';
        hw_css += 'background-color: #008000;"\r\n';
        hw_css += '}\r\n';
        hw_css += 'tr.hw-recommendation-lose {\r\n';
        hw_css += 'background-color: #800000;"\r\n';
        hw_css += '}\r\n';
        hw_css += 'th.hw-recommendation {\r\n';
        hw_css += 'text-align:center;font-weight:bold;\r\n';
        hw_css += 'margin:3px;padding:3px;border-radius:12px;\r\n';
        hw_css += 'border:#ddddff solid 1px;color:#ffffff;background-color:#ccccff;\r\n';
        hw_css += '}\r\n';
        hw_css += 'div.hw-recommendation {\r\n';
        hw_css += 'overflow-y:auto;\r\nscrollbar-width:thin;\r\n';
        hw_css += 'min-width:510px;width:510px;\r\n';
        hw_css += '}\r\n';
        hw_css += 'td.hw-recommendation-unmatched {\r\n';
        hw_css += 'background-color: rgba(212,212,212, 0.5);opacity:70%;\r\n';
        hw_css += '}\r\n';
        hw_css += 'span.hw-battle-hero-icon {\r\n';
        hw_css += 'background-size: 32px 32px;\r\nheight:32px;\r\nwidth:32px;\r\nmargin:2px;\r\n';
        hw_css += 'background-position:center;\r\n';
        hw_css += 'background-clip:padding-box;\r\n';
        hw_css += 'background-repeat:no-repeat;\r\n';
        hw_css += 'display:inline-block;\r\n';
        hw_css += '}\r\n';
        hw_css += 'img.hw-battle-hero-icon {\r\n';
        hw_css += 'background-size: 32px 32px;\r\nheight:32px;\r\nwidth:32px;\r\nmargin:0;\r\n';
        hw_css += 'background-position:center;\r\n';
        hw_css += 'background-clip:padding-box;\r\n';
        hw_css += 'background-repeat:no-repeat;\r\n';
        hw_css += 'display:inline-block;\r\n';
        hw_css += '}\r\n';
        hw_css += '</style>';

        jQuery("head").append(hw_css);
    }
    loadCss();

    function debugLog(message) {
        const DEBUG = true;
        if (!DEBUG) {
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
                return base_Url + (x.image ?? "No ID matched: " + heroid);
            }
        }
        return "No ID matched: " + heroid;
    }

    function getHeroFrameImage(color) {
        if (!color) {
            if (color == 0) {
                return color;
            }
            return "No color passed";
        }
        return base_Url + ("Frames/Hero_" + color + ".png");

    }

    function getHeroStarsImage(stars) {
        if (!stars) {
            if (stars == 0) {
                return stars;
            }
            return "No stars passed";
        }
        return base_Url + ("stars_" + stars + ".png");

    }

    function htmlEncode(value) {
        return jQuery('<div/>').text(value).html();
    }

    function htmlDecode(value) {
        return jQuery('<div/>').html(value).text();
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
            if (hw_ArenaHistory.length > 500) {
                hw_ArenaHistory.sort((a, b) => { return a.startTime - b.startTime; });
                if (hw_ArenaHistory[0].startTime > hw_ArenaHistory[hw_ArenaHistory.length - 1].startTime) {
                    hw_ArenaHistory.sort((a, b) => { return b.startTime - a.startTime; });
                    debugLog("Arena History Sort in wrong order, correcting");
                }
                while (hw_ArenaHistory.length > 500) {
                    hw_ArenaHistory.shift();
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
        existingLog.win = winCount > 1;

        GM_setValue("hw_ArenaHistory", JSON.stringify(hw_ArenaHistory));
        debugLog("hw_ArenaHistory.length: " + hw_ArenaHistory.length);
    }

    function addGrandArenaBattleLogIfNew(log, myUserId) {
        if(!log) {
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
            if (hw_GrandArenaHistory.length > 500) {
                hw_GrandArenaHistory.sort((a, b) => { return a.startTime - b.startTime; });
                if (hw_GrandArenaHistory[0].startTime > hw_GrandArenaHistory[hw_GrandArenaHistory.length - 1].startTime) {
                    hw_GrandArenaHistory.sort((a, b) => { return b.startTime - a.startTime; });
                    debugLog("Grand Arena History Sort in wrong order, correcting");
                }
                while (hw_GrandArenaHistory.length > 500) {
                    hw_GrandArenaHistory.shift();
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
        for (var j = 0; j < existingLog.battles.length;j++) {
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
        result.userId = enemy.user.id;
        result.userName = enemy.user.name;
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
        result.wins = winCount + " / " + battles.length;

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
        result.wins = winCount + " / " + battles.length;

        return result;
    }

    function displayGrandArenaRecommendation(container, recommendation, opponentTeams) {
        if (!container) {
            debugLog("displayGrandArenaRecommendation - no container");
            return;
        }
        if (!recommendation) {
            debugLog("displayGrandArenaRecommendation - no recommendation");
            return;
        }
        if (!recommendation.battles) {
            debugLog("displayGrandArenaRecommendation - no battles");
            return;
        }
        if (!recommendation.battles.length) {
            return;
        }
        var content = jQuery('<table />');
       for (var i = 0; i < recommendation.battles.length; i++) {
            var battle = recommendation.battles[i];
            var when = new Date(Number.parseInt(battle.startTime) * 1000).toLocaleString();
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
                for (var l = thisBattle.myTeam.length; l--;l>= 0) {
                    td.append(buildHeroDisplay(thisBattle.myTeam[l]));
                }
                tr.append(td);
                td = jQuery('<td />');
                if (!doesAnyTeamContainKey(opponentTeams, thisBattle.opponentTeamKey)) {
                    td.addClass("hw-recommendation-unmatched");
                }
                for (var k = 0; k < thisBattle.opponentTeam.length; k++) {
                    td.append(buildHeroDisplay(thisBattle.opponentTeam[k]));
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

    function displayArenaRecommendation(container, recommendation, opponentTeams) {
        if (!container) {
            debugLog("displayArenaRecommendation - no container");
            return;
        }
        if (!recommendation) {
            debugLog("displayArenaRecommendation - no recommendation");
            return;
        }
        if (!recommendation.battles) {
            debugLog("displayArenaRecommendation - no battles");
            return;
        }
        if (!recommendation.battles.length) {
            return;
        }
        var content = jQuery('<table />');
        for (var i = 0; i < recommendation.battles.length; i++) {
            var battle = recommendation.battles[i];
            var when = new Date(Number.parseInt(battle.startTime) * 1000).toLocaleString();
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
                    td.append(buildHeroDisplay(thisBattle.myTeam[l]));
                }
                tr.append(td);
                td = jQuery('<td />');
                if (!doesAnyTeamContainKey(opponentTeams, thisBattle.opponentTeamKey)) {
                    td.addClass("hw-recommendation-unmatched");
                }
                for (var k = 0; k < thisBattle.opponentTeam.length; k++) {
                    td.append(buildHeroDisplay(thisBattle.opponentTeam[k]));
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

    function buildHeroDisplay(hero) {
        if (!hero) {
            return "No Hero";
        }
        var content = '<span style="background-image:url(\'';
        content += htmlEncode(getHeroImage(hero.id));
        content += '\');" class="hw-battle-hero-icon" />';

        var result = jQuery(content);

        content = '<img src="';
        content += htmlEncode(getHeroStarsImage(hero.star));
        content += '" style="background-image: url(\'';
        content += htmlEncode(getHeroFrameImage(hero.color));
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

    function doesAnyTeamContainKey(teams, key) {
        if (!key) {
            debugLog("doesAnyTeamContainKey - no key");
            return false;
        }
        debugLog("doesAnyTeamContainKey - " + key);
        if (!teams) {
            debugLog("doesAnyTeamContainKey - no team");
            return false;
        }
        debugLog("doesAnyTeamContainKey - has team");
        if (!teams.length) {
            debugLog("doesAnyTeamContainKey - team empty");
            return false;
        }
        debugLog("doesAnyTeamContainKey - start loop");
        for (var i = 0; i < teams.length; i++) {
            if (!teams[i].key) {
                teams[i].key = generateTeamKey(teams[i]);
            }
            debugLog(teams[i].key);
            if (key == teams[i].key) {
                debugLog("Match - " + teams[i].key);
                return true;
            }
        }
        debugLog("doesAnyTeamContainKey - no match");
       return false;
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
            var newScore = calculateLevenshteinDistance(teams[i].key, key);
            if (newScore < bestScore) {
                debugLog("Better - " + teams[i].key);
                bestScore = newScore;
                bestTeam = teams[i];
                return true;
            }
        }
        return bestTeam;
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
        for (var k = 0; k < results.length; k++) {
            var tr = jQuery("<tr></tr>");
            var th = jQuery('<th class="hw-recommendation"></th>');
            var txt = results[k].userName + " " + results[k].wins;
            if (results[k].place) {
                txt = "[" + results[k].place  + "] - " + txt;
            }
            th.text(txt);
            results[k].header = th;
            tr.append(th);
            thead.append(tr);
        }
        for (var j = 0; j < results.length; j++) {
            var td = jQuery('<div class="hw-recommendation"></div>');
            var me = results[j];
            displayGrandArenaRecommendation(td, me, enemies[j].heroes);
            hookupShowRecommendation(me, me.header, td, results);
            hw_GA_Recommend.append(td);
            td.hide();
        }
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
        for (var k = 0; k < results.length; k++) {
            var tr = jQuery('<tr></tr>');
            var th = jQuery('<th class="hw-recommendation"></th>');
            var txt = results[k].userName + " " + results[k].wins;
            if (results[k].place) {
                txt = "[" + results[k].place + "] - " + txt;
            }
            th.text(txt);
            results[k].header = th;
            tr.append(th);
            thead.append(tr);
        }
        for (var j = 0; j < results.length; j++) {
            var td = jQuery('<div class="hw-recommendation"></div>');
            var me = results[j];
            displayArenaRecommendation(td, me);
            hookupShowRecommendation(me, me.header, td, results);
            hw_GA_Recommend.append(td);
            td.hide();
        }
        hw_GA_Recommend.show();
    }

    function hookupShowRecommendation(me, header, body, allResults) {
        me.body = body;
        header.click(function () {
            for (var i = 0; i < allResults.length; i++) {
                allResults[i].body.hide();
                allResults[i].header.css('background-color', '');
            }
            body.show();
            header.css('background-color', '#000000');
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
        if (!x[0].heroes) {
            debugLog("extractGrandArenaEnemies - no heroes");
            return null;
        }
        if (x[0].heroes.length != 3) {
            debugLog("extractGrandArenaEnemies - wrong number of teams");
            return null;
        }
        if (!x[0].heroes[0].length) {
            debugLog("extractGrandArenaEnemies - no heroes in teams");
            return null;
        }
        if (!x[0].place) {
            debugLog("extractGrandArenaEnemies - no place");
            return null;
        }
        if (!x[0].userId) {
            debugLog("extractGrandArenaEnemies - no user id");
            return null;
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

    function heroGetAllHookup(httpReq, ident) {
        hw_HeroGetAll = null;
        httpReq.addEventListener("readystatechange", function (evt) {
            if (!isReady(this)) {
                return;
            }
            debugLog("heroGetAllHookup - ready");
            var jsonObj = extractResultsArray(this);
            if (!jsonObj) { return; }
            var x = extractResultsByIdent(jsonObj, ident);
            debugLog(x);
            hw_HeroGetAll = x.response;
            //Problem - this is not an array, needs to be mapped somehow.

        });
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

    function petGetAllHookup(httpReq, ident) {
        hw_PetGetAll = null;
        httpReq.addEventListener("readystatechange", function (evt) {
            if (!isReady(this)) {
                return;
            }
            debugLog("petGetAllHookup - ready");
            var jsonObj = extractResultsArray(this);
            if (!jsonObj) { return; }
            var x = extractResultsByIdent(jsonObj, ident);
            debugLog(x);
            hw_PetGetAll = x.response;
        });
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

    function arenaAttackHookup(httpReq, ident) {
        if (!ident) {
            debugLog("arenaAttack - ident NULL");
            return;
        }
        httpReq.addEventListener("readystatechange", function (evt) {
            if (!isReady(this)) {
                return;
            }
            debugLog("arenaAttack - ready");
            var jsonObj = extractResultsArray(this);
            if (!jsonObj) { return; }

            var x = extractResultsByIdent(jsonObj, ident);
            debugLog(x);
            if (!x) {
                debugLog("arenaAttackHookup: results not found");
                return;
            }
            if (!x.response) {
                debugLog("arenaAttackHookup: results.response not found");
                return;
            }
            x = x.response;
            if (!x.battles) {
                debugLog("arenaAttackHookup: results.response.battles not found");
                return;
            }
            x = x.battles;
            for (var j = 0; j < x.length; j++) {
                addArenaBattleLogIfNew(createArenaBattleLog(x[j], getUserId(httpReq)), getUserId(httpReq));
            }
        });
    }

    (function (send) {
        XMLHttpRequest.prototype.send = function (data) {
            try {
                if (!data) {
                    return;
                }
                var dataStr = String.fromCharCode.apply(null, new Uint8Array(data));
                if (!(dataStr && dataStr.length > 5)) {
                    return;
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
                    debugLog('Entered send - ' + name + " / " + ident);
                    switch (name) {
                        case "heroGetAll":
                            heroGetAllHookup(this, ident);
                            break;
                        case "pet_getAll":
                            petGetAllHookup(this, ident);
                            break;
                        case "grandFindEnemies":
                            grandFindEnemiesHookup(this, ident);
                            break;
                        case "arenaFindEnemies":
                            arenaFindEnemiesHookup(this, ident);
                            break;
                        case "battleGetByType":
                            battleGetByTypeHookup(this, ident);
                            break;
                        case "grandAttack":
                            hideRecommendation();
                            break;
                        case "arenaAttack":
                            hideRecommendation();
                            break;
                    }
                    /*
                    if (name == 'grandCheckTargetRange') {
                        hideRecommendation();
                    }
                    */
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
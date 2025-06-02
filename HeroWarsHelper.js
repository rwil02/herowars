// ==UserScript==
// @name         Hero Wars Helper
// @namespace    http://l-space-design.com/
// @version      0.9
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
    const DEBUG = GM_getValue('LOG_DEBUG', 'true') != 'false';
    const INFO = GM_getValue('LOG_INFO', 'true') != 'false';
    const WARNING = GM_getValue('LOG_WARNING', 'true') != 'false';

    try { GM_xmlhttpRequest = GM_xmlhttpRequest || this.GM_xmlhttpRequest; } catch (e) { GM_xmlhttpRequest = false; }

    let hw_HeroList = JSON.parse('[]');
    let hw_HeroMap = {};

    function buildHeroMap() {
        hw_HeroMap = {};
        for (let i = 0; i < hw_HeroList.length; i++) {
            let hero = hw_HeroList[i];
            hw_HeroMap[hero.id] = hero;
        }
    }

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
                const responseText = response.responseText;
                if ((responseText) && (responseText.length > 2)) {
                    try {
                        hw_HeroList = JSON.parse(responseText);
                        debugLog("hw_HeroList.length: " + hw_HeroList.length);
                        buildHeroMap();
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
            url: base_Url + "HeroWarsHelper.css?" + Date.now(),
            headers: {
                "Accept": "text/css" // If not specified, browser defaults will be used.
            },
            responseType: "document",
            onload: function (response) {
                let hw_css = '<style>\r\n';
                hw_css += response.responseText;
                hw_css += '\r\n</style>';
                jQuery("head").append(hw_css);
                debugLog(response.finalUrl + " loaded successfully");
                let lastModified = response.responseHeaders.match(/Last-Modified: (.*)/i);
                if (lastModified && lastModified[1]) {
                    debugLog("CSS Last-Modified: " + lastModified[1]);
                }
            }
        });
    }
    let hw_ArenaFindEnemies = null;
    let hw_GrandFindEnemies = null;
    let hw_GrandArenaHistory = JSON.parse(GM_getValue("hw_GrandArenaHistory", "[]"));
    let hw_ArenaHistory = JSON.parse(GM_getValue("hw_ArenaHistory", "[]"));
    let hw_UserId = Number.parseInt(GM_getValue("hw_UserId", ""));

    let hw_GA_Recommend = null;

    function debugLog(message) {
        if (!DEBUG) {
            return;
        }
        console.debug(message);
    }
    function infoLog(message) {
        if (!INFO) {
            return;
        }
        console.info(message);
    }
    function warningLog(message) {
        if (!WARNING) {
            return;
        }
        console.warn(message);
    }

    function getUserId(httpReq) {
        try {
            if (!httpReq || !httpReq._requestHeaders) {
                return hw_UserId;
            }
            const x = Number.parseInt(httpReq._requestHeaders["X-Auth-Player-Id"]);
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

    function generateTeamKey(team) {
        if (!team) {
            return "";
        }
        let x = "";
        for (let i = 0; i < team.length; i++) {
            if (x.length > 0) {
                x += "|";
            }
            let member = team[i];
            if ("undefined_undefined_undefined_undefined" == member.key) {
                member.key = undefined;
            }
            if (!member.key) {
                member.key = generateTeamMember(member).key;
            }
            x += member.key;
        }
        return x;
    }

    function generateTeamMember(member) {
        let x = {};
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

    function generateTeam(team, banner) {
        if (!team) {
            warningLog("No team passed to generateTeam");
            return [];
        }
        let x = [];
        let j = 0;
        try {
            const teamArray = Array.isArray(team) ? team : Object.values(team);
            for (const member of teamArray) {
                const y = generateTeamMember(member);
                if (y.id) {
                    x[j] = y;
                    j++;
                }
            }
            if (banner) {
                let slotsArr = [];
                if (Array.isArray(banner.slots)) {
                    slotsArr = banner.slots.slice();
                } else if (banner.slots && typeof banner.slots === 'object') {
                    slotsArr = Object.keys(banner.slots)
                        .sort((a, b) => a - b)
                        .map(k => banner.slots[k]);
                }
                while (slotsArr.length < 3) {
                    slotsArr.push(-1);
                }
                x.banner = { id: banner.id, slots: slotsArr };
            } else {
                x.banner = { id: -1, slots: [-1, -1, -1] };
            }
            return x;
        } catch (e) {
            warningLog(e);
            warningLog(team);
            throw e;
        }
    }

    // https://h-w.fun/en/order-rank/
    function getHeroPosition(heroid) {
        if (!heroid) {
            if (heroid !== 0) {
                warningLog("No ID passed");
                return undefined;
            }
        }
        if (!hw_HeroMap) {
            warningLog("No Hero Map: " + heroid);
            return undefined;
        }
        if (hw_HeroMap.hasOwnProperty(heroid)) {
            return hw_HeroMap[heroid].position;
        }
        warningLog("No ID matched: " + heroid);
        return undefined;
    }
    function getHeroName(heroid) {
        if (heroid === undefined || heroid === null) return "No ID passed";
        const hero = hw_HeroMap[heroid];
        return hero ? (hero.name ?? "No ID matched: " + heroid) : "No ID matched: " + heroid;
    }

    function getHeroImage(heroid) {
        if (heroid === undefined || heroid === null) return "No ID passed";
        const hero = hw_HeroMap[heroid];
        return hero ? resource_Url + (hero.image ?? "No ID matched: " + heroid) : "No ID matched: " + heroid;
    }

    function getHeroFrameImage(color, id) {
        if (!color) {
            if (color == 0) {
                return color;
            }
            return "No color passed";
        }
        if (id > 5999) {
            return resource_Url + ("Frames/Pet_" + color + ".png");
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

    function createBattleLog(originalLog, myUserId) {
        if (!originalLog) {
            return null;
        }
        let newLog = {};
        newLog.startTime = originalLog.startTime;
        debugLog(originalLog);

        const attacker = generateTeam(originalLog.attackers, originalLog.effects.attackersBanner);
        const defender = generateTeam(originalLog.defenders[0], originalLog.effects.defendersBanner);

        if (myUserId == originalLog.userId) {
            newLog.opponentId = originalLog.typeId;
            newLog.type = "A";
            newLog.myTeam = attacker;
            newLog.opponentTeam = defender;
            newLog.win = originalLog.result.win;
        } else {
            if (myUserId != originalLog.typeId) {
                warningLog("Not defender or attacker: " + myUserId);
                return null;
            }
            newLog.opponentId = originalLog.userId;
            newLog.type = "D";
            newLog.myTeam = defender;
            newLog.opponentTeam = attacker;
            newLog.win = !originalLog.result.win;
        }
        newLog.myTeamKey = generateTeamKey(newLog.myTeam);
        newLog.opponentTeamKey = generateTeamKey(newLog.opponentTeam);

        return newLog;
    }

    function addArenaBattleLogIfNew(log) {
        addBattleLogIfNew(hw_ArenaHistory, "hw_ArenaHistory", log, 1);
    }

    function addGrandArenaBattleLogIfNew(log) {
        addBattleLogIfNew(hw_GrandArenaHistory, "hw_GrandArenaHistory", log, 2);
    }

    function addBattleLogIfNew(history, historyName, log, minWins) {
        if (!log) {
            return;
        }
        let existingLog = null;

        for (let i = 0; i < history.length; i++) {
            if (log.opponentId != history[i].opponentId) {
                continue;
            }
            if (log.startTime != history[i].startTime) {
                continue;
            }
            if (log.type != history[i].type) {
                continue;
            }
            existingLog = history[i];
        }
        if (null == existingLog) {
            trimHistory(history, max_HistorySize, historyName);

            existingLog = {};
            existingLog.startTime = log.startTime;
            existingLog.type = log.type;
            existingLog.opponentId = log.opponentId;
            existingLog.battles = [];
            history.push(existingLog);
        }
        let winCount = 0;
        for (let j = 0; j < existingLog.battles.length; j++) {
            let battle = existingLog.battles[j];
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
        existingLog.win = winCount >= minWins;

        GM_setValue(historyName, JSON.stringify(history));
        debugLog(historyName + ".length: " + history.length);
    }

    function trimHistory(historyArray, maxSize, type) {
        if (historyArray.length > maxSize) {
            historyArray.sort((a, b) => a.startTime - b.startTime);
            if (historyArray[0].startTime > historyArray[historyArray.length - 1].startTime) {
                historyArray.sort((a, b) => b.startTime - a.startTime);
                debugLog(type + " History Sort in wrong order, correcting");
            }
            while (historyArray.length > maxSize) {
                const ex = historyArray.shift();
                infoLog(type + " History Removing: " + ex.opponentId + ", " + displayDateTime(new Date(Number.parseInt(ex.startTime) * 1000)));
            }
        }
    }

    function hideRecommendation() {
        if (!hw_GA_Recommend) {
            return;
        }
        hw_GA_Recommend.hide();
    }

    function getGrandArenaRecommendation(enemy) {
        let result = {};
        if (enemy.user) {
            result.userId = enemy.user.id;
            result.userName = enemy.user.name;
        } else {
            result.userId = 0;
            result.userName = "Missing User";
        }
        result.place = enemy.place;
        result.opponentTeams = [];
        debugLog("getGrandArenaRecommendation");
        debugLog(enemy);
        if (enemy.heroes) {
            for (let j = 0; j < enemy.heroes.length; j++) {
                result.opponentTeams.push(generateTeam(enemy.heroes[j], enemy.banners && enemy.banners.length ? enemy.banners[0] : null));
            }
        }
        let battles = [];
        let winCount = 0;
        for (let i = 0; i < hw_GrandArenaHistory.length; i++) {
            let battle = hw_GrandArenaHistory[i];
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
        let result = {};
        result.userId = enemy.user.id;
        result.userName = enemy.user.name;
        result.place = enemy.place;
        result.opponentTeams = [];
        debugLog("getArenaRecommendation");
        debugLog(enemy);
        if (enemy.heroes) {
            result.opponentTeams.push(generateTeam(enemy.heroes, enemy.banners && enemy.banners.length ? enemy.banners[0] : null));
        }
        let battles = [];
        let winCount = 0;
        for (let i = 0; i < hw_ArenaHistory.length; i++) {
            const battle = hw_ArenaHistory[i];
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
    function displayRecommendation(container, recommendation, opponentTeams) {
        if (!container) {
            warningLog("displayRecommendation - no container");
            return;
        }
        if (!recommendation) {
            warningLog("displayRecommendation - no recommendation");
            return;
        }
        if (!recommendation.battles) {
            warningLog("displayRecommendation - no battles");
            return;
        }
        if (!recommendation.battles.length) {
            return;
        }
        try {
            let content = jQuery('<table />');
            for (let i = 0; i < recommendation.battles.length; i++) {
                if (i >= 5) {
                    break;
                }
                const battle = recommendation.battles[i];
                const when = displayDateTime(new Date(Number.parseInt(battle.startTime) * 1000));
                let tr = jQuery('<tr />');
                if (battle.win) {
                    tr.addClass("hw-recommendation-win");
                } else {
                    tr.addClass("hw-recommendation-lose");
                }
                let th = jQuery('<th colspan="2" class="hw-recommendation"></th>');
                th.text(when);
                tr.append(th);
                content.append(tr);
                for (let j = 0; j < battle.battles.length; j++) {
                    const thisBattle = battle.battles[j];
                    buildRecommendationLine(thisBattle, opponentTeams, content);
                }
            }
            container.append(content);
        } catch (e) {
            warningLog("displayRecommendation - error: " + e.message);
        }
    }

    function sortedTeam(team) {
        return [...team].sort((a, b) => {
            if (!a) {
                return (!b) ? 0 : 1;
            }
            const aPosition = getHeroPosition(a.id);
            const bPosition = getHeroPosition(b.id);
            return (aPosition == bPosition) ? (a.id || 0) - (b.id || 0) : (aPosition || 0) - (bPosition || 0);
        });
    }

    function buildRecommendationLine(thisBattle, opponentTeams, content) {
        try {
            let tr = jQuery('<tr />');
            if (thisBattle.win) {
                tr.addClass("hw-recommendation-win");
            } else {
                tr.addClass("hw-recommendation-lose");
            }
            let td = jQuery('<td />');
            let myTeam = sortedTeam(thisBattle.myTeam).reverse();
            for (const member of myTeam) {
                td.append(buildHeroDisplay(member, true));
            }
            tr.append(td);
            td = jQuery('<td />');
            debugLog('buildRecommendationLine: ' + thisBattle.opponentTeamKey);

            let opponents = sortedTeam(thisBattle.opponentTeam);
            debugLog(opponentTeams);
            const team = getBestMatchingTeam(opponentTeams, thisBattle.opponentTeam);
            debugLog(opponentTeams);
            debugLog(team);
            if ((!team) || (team.key != thisBattle.opponentTeamKey)) {
                td.addClass("hw-recommendation-unmatched");
            }
            for (const opponentHero of opponents) {
                let hero = getBestMatchingHero(team, opponentHero);
                if (!hero) {
                    hero = false;
                }
                td.append(buildHeroDisplay(opponentHero, hero.key == opponentHero.key));
            }
            tr.append(td);
            content.append(tr);
        } catch (e) {
            warningLog("buildRecommendationLine - error: " + e.message);
        }
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
        let content = '<span style="background-image:url(\'';
        content += htmlEncode(getHeroImage(hero.id));
        content += '\');" class="hw-battle-hero-icon" />';

        let result = jQuery(content);
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

    function getBestMatchingTeam(teams, team) {
        if (!team) {
            warningLog("getBestMatchingTeam - no team");
            return null;
        }
        if (!team.key) {
            debugLog("getBestMatchingTeam - no key");
        }
        if (!teams) {
            warningLog("getBestMatchingTeam - no teams");
            return null;
        }
        if (!teams.length) {
            debugLog("getBestMatchingTeam - teams empty");
            return null;
        }
        debugLog("getBestMatchingTeam - start loop");
        const targetIds = new Set(team.map(member => member.id));
        let bestTeam = teams[0];
        let bestScore = -1;
        for (let i = 0; i < teams.length; i++) {
            const candidate = teams[i];
            if (!candidate.length) {
                warningLog(`getBestMatchingTeam - team ${i} is empty`);
                continue;
            }
            if ("undefined_undefined_undefined_undefined" == candidate.key) {
                candidate.key = undefined;
            }
            if (!candidate.key) {
                candidate.key = generateTeamKey(candidate);
            }
            // Collect IDs from the candidate team
            const candidateIds = new Set(candidate.map(member => member.id));
            // Count matching IDs
            let matchCount = 0;
            for (let id of candidateIds) {
                if (targetIds.has(id)) {
                    matchCount++;
                }
            }
            debugLog(`Team ${i} matchCount: ${matchCount}`);
            if (matchCount > bestScore) {
                bestScore = matchCount;
                bestTeam = candidate;
            }
        }
        return bestTeam;
    }

    function getBestMatchingHero(heros, hero) {
        if (!hero) {
            warningLog("getBestMatchingHero - no hero");
            return null;
        }
        if (!hero.id) {
            warningLog("getBestMatchingHero - no id");
            if (!hero.key) {
                warningLog("getBestMatchingHero - no key");
                return null;
            }
        }
        if (!hero.key) {
            warningLog("getBestMatchingHero - no key");
        }
        if (!heros) {
            warningLog("getBestMatchingHero - no heros");
            return null;
        }
        if (!Array.isArray(heros)) {
            warningLog("getBestMatchingHero - heros not an array");
            return null;
        }
        if (!heros.length) {
            warningLog("getBestMatchingHero - heros empty");
            return null;
        }
        debugLog("getBestMatchingHero - start loop " + hero.key);
        for (const currentHero of heros) {
            if (currentHero.id == hero.id) {
                return currentHero;
            }
        }
        return { id: -1, key: "" };
    }

    function setupRecommendations(enemies, getRecommendationFunc) {
        hideRecommendation();
        if (!enemies || !enemies.length) {
            warningLog("setupRecommendations - invalid");
            return;
        }
        debugLog("setupRecommendations");
        debugLog(enemies);
        let results = [];
        for (let i = 0; i < enemies.length; i++) {
            results.push(getRecommendationFunc(enemies[i]));
        }
        debugLog(results);
        setupRecommendationsHeaders(results);
        setupRecommendationsDisplay(results);
        hw_GA_Recommend.show();
    }

    function setupRecommendationsDisplay(results) {
        for (let j = 0; j < results.length; j++) {
            const div = jQuery('<div class="hw-recommendation"></div>');
            const me = results[j];
            displayRecommendation(div, me, me.opponentTeams);
            hookupShowRecommendation(me, me.header, div, results);
            hw_GA_Recommend.append(div);
            div.hide();
        }
    }

    function setupRecommendationsHeaders(results,) {
        if (!hw_GA_Recommend) {
            hw_GA_Recommend = jQuery('<div class="hw-recommendation-head">HERE WE GO</div>');
            jQuery('main.layout_content').prepend(hw_GA_Recommend);
        }
        hw_GA_Recommend.empty();
        let t = jQuery('<table class="hw-recommendation"></table>');
        hw_GA_Recommend.append(t);
        let thead = jQuery("<thead></thead>");
        t.append(thead);

        for (let k = 0; k < results.length; k++) {
            let winStyle = 'never';
            if (results[k].battles.length) {
                winStyle = 'win0';
                if (results[k].winPercent >= 0.05) {
                    winStyle = "win1";
                    if (results[k].winPercent >= 0.5) {
                        winStyle = "win2";
                        if (results[k].winPercent >= 0.75) {
                            winStyle = "win3";
                            if (results[k].winPercent >= 0.85) {
                                winStyle = "win4";
                            }
                        }
                    }
                }
            }
            let tr = jQuery('<tr></tr>');
            let th = jQuery('<th class="hw-recommendation"></th>');
            let txt = results[k].wins;
            th.text(txt);
            if (winStyle.length > 2) {
                th.addClass(winStyle);
            }
            tr.append(th);
            th = jQuery('<th class="hw-recommendation" style="width:100%;"></th>');
            txt = results[k].userName;
            th.text(txt);
            if (winStyle.length > 2) {
                th.addClass(winStyle);
            }
            tr.append(th);

            th = jQuery('<th class="hw-recommendation"></th>');
            txt = ' ';
            if (results[k].place) {
                txt = "[" + results[k].place + "]";
            }
            th.text(txt);
            if (winStyle.length > 2) {
                th.addClass(winStyle);
            }
            tr.append(th);
            results[k].header = tr;
            thead.append(tr);
        }
    }

    function hookupShowRecommendation(me, header, body, allResults) {
        me.body = body;
        header.click(function () {
            for (let i = 0; i < allResults.length; i++) {
                allResults[i].body.hide();
                allResults[i].header.find('th').css('background-color', '');
            }
            body.show();
            header.find('th').css('background-color', '#333333');
        });

        setTimeout(function () { body.hide(); header.hide(); }, 90000);
    }

    function extractResults(httpReq) {
        const jsonObj = getJsonObject(httpReq);
        if (!jsonObj) { return null; }
        debugLog(jsonObj);
        if (!jsonObj.results) { return null; }
        return jsonObj.results;
    }

    function extractResultsArray(httpReq) {
        const result = extractResults(httpReq);
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
        for (let j = 0; j < result.length; j++) {
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
        let x = jsonObj.response;
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
        let place = parseInt(x[0].place);
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
        let x = jsonObj.response;
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
            warningLog("extractArenaEnemies - wrong number of heroes");
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
            let decodedString = null;
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
            warningLog("grandFindEnemies - ident NULL");
            return;
        }
        hw_ArenaFindEnemies = '';
        hw_GrandFindEnemies = '';
        httpReq.addEventListener("readystatechange", function (evt) {
            if (!isReady(this)) {
                return;
            }
            debugLog("grandFindEnemies - ready");
            const jsonObj = extractResultsArray(this);
            if (!jsonObj) { return; }

            const x = extractResultsByIdent(jsonObj, ident);
            debugLog(x);
            if (!x) {
                warningLog("grandFindEnemiesHookup: results not found");
                return;
            }
            const result = extractGrandArenaEnemies(x);
            if (result) {
                hw_GrandFindEnemies = result;
                setupRecommendations(hw_GrandFindEnemies, getGrandArenaRecommendation)
                return;
            }
        });
    }

    function arenaFindEnemiesHookup(httpReq, ident) {
        if (!ident) {
            warningLog("arenaFindEnemies - ident NULL");
            return;
        }
        hw_ArenaFindEnemies = '';
        hw_GrandFindEnemies = '';
        httpReq.addEventListener("readystatechange", function (evt) {
            if (!isReady(this)) {
                return;
            }
            debugLog("arenaFindEnemies - ready");
            const jsonObj = extractResultsArray(this);
            if (!jsonObj) { return; }

            const x = extractResultsByIdent(jsonObj, ident);
            debugLog(x);
            if (!x) {
                warningLog("arenaFindEnemiesHookup: results not found");
                return;
            }
            const result = extractArenaEnemies(x);
            if (result) {
                hw_ArenaFindEnemies = result;
                setupRecommendations(result, getArenaRecommendation)
                return;
            }
        });
    }

    function callTypeHookup(httpReq, call_id, ident) {
        if (!call_id) {
            warningLog("call_id NULL");
            return;
        }
        if (!ident) {
            warningLog(call_id + " - ident NULL");
            return;
        }
        httpReq.addEventListener("readystatechange", function (evt) {
            if (!isReady(this)) {
                return;
            }
            const jsonObj = extractResultsArray(this);
            if (!jsonObj) { return; }

            const x = extractResultsByIdent(jsonObj, ident);
            debugLog(call_id);
            debugLog(x);
       });
    }

    function battleGetByTypeHookup(httpReq, ident) {
        if (!ident) {
            warningLog("battleGetByType - ident NULL");
            return;
        }
        httpReq.addEventListener("readystatechange", function (evt) {
            if (!isReady(this)) {
                return;
            }
            debugLog("battleGetByType - ready");
            const jsonObj = extractResultsArray(this);
            if (!jsonObj) { return; }

            let x = extractResultsByIdent(jsonObj, ident);
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
            for (const replay of x.replays) {
                switch (replay.type) {
                    case "arena":
                        addArenaBattleLogIfNew(createBattleLog(replay, getUserId(httpReq)));
                        break;
                    case "grand":
                        addGrandArenaBattleLogIfNew(createBattleLog(replay, getUserId(httpReq)));
                        break;
                    default:
                        debugLog("battleGetByTypeHookup: unknown type [" + replay.type + "]");
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
                let dataStr = null;
                if (typeof data === "string") {
                    dataStr = data.trim();
                } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
                    dataStr = String.fromCharCode.apply(null, new Uint8Array(data)).trim();
                }
                if (!(dataStr && dataStr.length > 2)) {
                    return;
                }
                if ((dataStr[0] != '{') && (dataStr[0] != '[')) {
                    return;
                }
                let calls = JSON.parse(dataStr);
                if ((calls.calls) && (calls.calls.length)) {
                    calls = calls.calls;
                }
                if (!calls.length) {
                    debugLog('Entered send with no calls');
                    return;
                }
                const callsToIgnore = [
                    "adventure_find","adventure_getActiveData","adventure_getPassed","adventureSolo_getActiveData",
                    "arenaCheckTargetRange", "arenaGetAll", "artifactGetChestLevel", "banner_getAll",
                    "battlePass_getInfo", "battlePass_getSpecial", "billingGetAll", "billingGetLast",
                    "bossGetAll", "brawl_getInfo", "brawl_questGetInfo", "buffs_getInfo",
                    "bundleGetAllAvailableId", "campaignStoryGetList", "chatsGetAll", "chatGetInfo",
                    "chatGetTalks", "clan_prestigeGetInfo", "clanDomination_getInfo", "clanGetActivityRewardTable",
                    "clanGetInfo", "clanGetPrevData", "clanInvites_getUserInbox", "clanRaid_getInfo",
                    "clanRaid_ratingInfo", "clanRaidSubscription_getInfo", "clanWarGetBriefInfo", "clanWarGetWarlordInfo",
                    "coopBundle_getInfo", "crossClanWar_getBriefInfo", "crossClanWar_getSettings", "dailyBonusGetInfo",
                    "epicBrawl_getBriefInfo",
                    "epicBrawl_getWinStreak", "expeditionGet", "freebieCheck", "freebieHaveGroup",
                    "friendsGetInfo", "gacha_getInfo", "getTime", "grandCheckTargetRange",
                    "hallOfFameGetTrophies", "heroesMerchantGet", "heroGetAll", "heroRating_getInfo",
                    "idle_getAll", "invasion_getInfo", "inventoryGet", "mailGetAll",
                    "mechanicAvailability", "mechanicsBan_getInfo", "missionGetAll", "missionGetReplace",
                    "newHeroNotification_get", "newYearGetInfo", "offerGetAll",
                    "offerwall_getActive", "pet_getAll", "pet_getChest", "pet_getPotionDailyBuyCount",
                    "pirateTreasureIsAvailable", "playable_getAvailable", "powerTournament_getState", "questGetAll",
                    "questGetEvents", "registration", "rewardedVideo_boxyGetInfo", "roleAscension_getAll",
                    "seasonAdventure_getInfo",
                    "settingsGetAll", "shopGetAll", "socialQuestGetInfo", "socialQuestGroupJoin",
                    "socialQuestGroupJoin", "socialQuestPost", "socialQuestPost", "specialOffer_getAll",
                    "splitGetAll", "stronghold_getInfo", "subscriptionGetInfo", "teamGetAll",
                    "team_getBanners",
                    "teamGetFavor", "telegramQuestGetInfo", "titanArenaCheckForgotten","titanArenaGetChestReward",
                    "titanArtifactGetChest","titanGetAll","titanGetSummoningCircle","titanSpiritGetAll",
                    "towerGetInfo","tutorialGetInfo","userGetAvailableAvatarFrames","userGetAvailableAvatars",
                    "userGetAvailableStickers", "userGetInfo", "userMergeGetStatus", "workshopBuff_getInfo",
                    "zeppelinGiftGet",
                    "stashClient",
                ];

                for (const call of calls) {
                    let name = call.name;
                    let ident = call.ident;
                    let handled = false;
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
                        default:
                            if (!callsToIgnore.includes(name)) {
                                infoLog('Unknown call - ' + name + " / " + ident);
                            }
                            break;
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
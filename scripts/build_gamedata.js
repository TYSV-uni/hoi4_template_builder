'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const OUTPUT   = path.join(DATA_DIR, 'gamedata.json');

function parseParadoxScript(text) {
    text = text.replace(/#.*$/gm, '');
    const tokens = text.match(/\{|\}|=|"[^"]*"|[^\s\{\}=]+/g) || [];
    let pos = 0;

    function parseNode() {
        const obj = {};
        const arr = [];
        let hasKeys = false;

        while (pos < tokens.length) {
            const token = tokens[pos++];
            if (token === '}') return hasKeys ? obj : arr;
            if (tokens[pos] === '=') {
                hasKeys = true;
                pos++;
                let value;
                if (tokens[pos] === '{') {
                    pos++;
                    value = parseNode();
                } else {
                    value = tokens[pos++];
                    if (value !== undefined) {
                        const numVal = Number(value);
                        if (!isNaN(numVal) && value.trim() !== '') value = numVal;
                        else if (value && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                    }
                }
                if (obj[token] !== undefined) {
                    if (!Array.isArray(obj[token])) obj[token] = [obj[token]];
                    obj[token].push(value);
                } else {
                    obj[token] = value;
                }
            } else {
                arr.push(token);
            }
        }
        return hasKeys ? obj : arr;
    }

    const parsedRoot = parseNode();
    return parsedRoot.technologies ? parsedRoot.technologies : parsedRoot;
}

function buildLocalization() {
    const locDir       = path.join(DATA_DIR, 'english_loc');
    const manifestPath = path.join(locDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return {};

    const locFiles = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const locData  = {};

    for (const file of locFiles) {
        const filePath = path.join(locDir, file);
        if (!fs.existsSync(filePath)) continue;
        for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
            const match = line.match(/^\s*([^:]+):\d*\s*"(.*)"/);
            if (match) locData[match[1].trim()] = match[2];
        }
    }
    return locData;
}

function buildTechDB() {
    const globalModifiersList = [
        'research_speed_factor', 'coordination_bonus', 'land_reinforce_rate',
        'land_night_attack', 'special_forces_cap', 'tech_air_damage_factor',
        'static_anti_air_damage_factor', 'static_anti_air_hit_chance_factor',
        'special_forces_training_time_factor', 'special_forces_no_supply_grace',
        'special_forces_out_of_supply_factor'
    ];
    const ignoredKeys = [
        'path', 'research_cost', 'start_year', 'folder', 'categories', 'ai_will_do',
        'allow', 'allow_branch', 'dependencies', 'show_equipment_icon',
        'on_research_complete', 'on_research_complete_limit',
        'special_project_specialization', 'show_effect_as_desc', 'sub_technologies',
        'sub_tech_index', 'desc', 'force_use_small_tech_layout', 'enable_building', 'xor'
    ];
    const effectFiles = [
        'data/effects/artillery.txt',
        'data/effects/electronic_mechanical_engineering.txt',
        'data/effects/infantry.txt',
        'data/effects/NSB_armor.txt',
        'data/effects/support.txt'
    ];

    const techDB = {};

    for (const relPath of effectFiles) {
        const filePath = path.join(__dirname, '../public', relPath);
        if (!fs.existsSync(filePath)) continue;

        const parsedData = parseParadoxScript(fs.readFileSync(filePath, 'utf8'));

        for (const [techId, data] of Object.entries(parsedData)) {
            if (techId.startsWith('@') || Array.isArray(data)) continue;

            const entry = { equipments: [], modules: [], subunits: [], project: null, modifiers: [] };

            if (data.enable_equipments)
                entry.equipments = Array.isArray(data.enable_equipments) ? data.enable_equipments : [data.enable_equipments];
            if (data.enable_equipment_modules)
                entry.modules = Array.isArray(data.enable_equipment_modules) ? data.enable_equipment_modules : [data.enable_equipment_modules];
            if (data.enable_subunits)
                entry.subunits = Array.isArray(data.enable_subunits) ? data.enable_subunits : [data.enable_subunits];

            if (data.on_research_complete) {
                const orcList = Array.isArray(data.on_research_complete) ? data.on_research_complete : [data.on_research_complete];
                for (const event of orcList) {
                    if (event.custom_effect_tooltip?.PROJECT) entry.project = event.custom_effect_tooltip.PROJECT;
                    else if (event.if?.custom_effect_tooltip?.PROJECT) entry.project = event.if.custom_effect_tooltip.PROJECT;
                }
            }

            for (const [key, value] of Object.entries(data)) {
                if (ignoredKeys.includes(key) || key.startsWith('enable_')) continue;
                if (globalModifiersList.includes(key)) {
                    entry.modifiers.push({ target: 'global', stat: key, value });
                } else if (typeof value === 'object' && !Array.isArray(value)) {
                    for (const [statKey, statVal] of Object.entries(value)) {
                        if (typeof statVal === 'number') {
                            entry.modifiers.push({ target: key, stat: statKey, value: statVal });
                        } else if (typeof statVal === 'object' && !Array.isArray(statVal)) {
                            for (const [terrainStat, tVal] of Object.entries(statVal)) {
                                if (typeof tVal === 'number')
                                    entry.modifiers.push({ target: key, stat: `${statKey}_${terrainStat}`, value: tVal });
                            }
                        }
                    }
                }
            }

            techDB[techId] = entry;
        }
    }
    return techDB;
}

function buildGameDB() {
    const subunits   = {};
    const equipments = {};

    const unitManifest = path.join(DATA_DIR, 'units/unit_file_names.json');
    if (fs.existsSync(unitManifest)) {
        for (const file of JSON.parse(fs.readFileSync(unitManifest, 'utf8'))) {
            const fp = path.join(DATA_DIR, 'units', file);
            if (!fs.existsSync(fp)) continue;
            try {
                const parsed = parseParadoxScript(fs.readFileSync(fp, 'utf8'));
                if (parsed.sub_units) Object.assign(subunits, parsed.sub_units);
            } catch (e) {}
        }
    }

    const eqManifest = path.join(DATA_DIR, 'units/equipment/equipment_file_names.json');
    if (fs.existsSync(eqManifest)) {
        for (const file of JSON.parse(fs.readFileSync(eqManifest, 'utf8'))) {
            const fp = path.join(DATA_DIR, 'units/equipment', file);
            if (!fs.existsSync(fp)) continue;
            try {
                const parsed = parseParadoxScript(fs.readFileSync(fp, 'utf8'));
                if (parsed.equipments) Object.assign(equipments, parsed.equipments);
            } catch (e) {}
        }
    }

    return { subunits, equipments };
}

(function main() {
    const start                    = Date.now();
    const localizationData         = buildLocalization();
    const techDB                   = buildTechDB();
    const { subunits, equipments } = buildGameDB();

    fs.writeFileSync(OUTPUT, JSON.stringify({ localizationData, techDB, subunits, equipments }), 'utf8');

    const kb = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
    console.log(`Done in ${Date.now() - start}ms — ${kb} KB -> ${OUTPUT}`);
})();

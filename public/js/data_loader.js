window.gameDB = { subunits: {}, equipments: {}, activeEquipment: {} };
window.dynamicTechDB = {};
window.localizationData = {};
window.activeBattalions = {};

window.globalState = {
    modifiers: {},
    enabledEquipments: new Set(),
    enabledModules: new Set(),
    reset() {
        this.modifiers = {};
        this.enabledEquipments.clear();
        this.enabledModules.clear();
    },
    addModifier(stat, value) {
        if (!this.modifiers[stat]) this.modifiers[stat] = 0;
        this.modifiers[stat] += value;
    }
};

window.getLoc = function(key) {
    if (!key) return "";
    let searchKey = String(key).replace("£tech_mod ", "").replace("£pol_idea ", "").trim();
    let altKey = searchKey.replace("motorised", "motorized").replace("armour", "armor");

    
    function resolve(raw) {
        const refMatch = raw.match(/^\$([^$]+)\$$/);
        if (refMatch) return window.getLoc(refMatch[1]);
        return raw;
    }

    if (window.localizationData[searchKey]) return resolve(window.localizationData[searchKey]);
    if (window.localizationData[altKey])    return resolve(window.localizationData[altKey]);

    let modKey = "MODIFIER_" + searchKey.toUpperCase();
    if (window.localizationData[modKey]) return resolve(window.localizationData[modKey]);

    let statKey = "STAT_" + searchKey.toUpperCase();
    if (window.localizationData[statKey]) return resolve(window.localizationData[statKey]);

    if (searchKey === "global") return "Global Target";

    return key;
};

async function loadLocalization() {
    try {
        
        const manifestResponse = await fetch('data/english_loc/manifest.json');
        if (!manifestResponse.ok) return;
        
        const locFiles = await manifestResponse.json();

        for (const file of locFiles) {
            try {
                const response = await fetch(`data/english_loc/${file}`);
                if (!response.ok) continue;
                const text = await response.text();
                const lines = text.split('\n');
                for (let line of lines) {
                    const match = line.match(/^\s*([^:]+):\d*\s*"(.*)"/);
                    if (match) {
                        window.localizationData[match[1].trim()] = match[2];
                    }
                }
            } catch (error) {
                console.warn(`Could not load loc file: ${file}`);
            }
        }
    } catch (error) {
        console.error("Failed to load localization JSON manifest.", error);
    }
}

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
                        let numVal = Number(value);
                        if (!isNaN(numVal) && value.trim() !== '') value = numVal;
                        else if (value && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                    }
                }
                const key = token;
                if (obj[key] !== undefined) {
                    if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
                    obj[key].push(value);
                } else {
                    obj[key] = value;
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

async function loadTechDatabase() {
    const globalModifiersList = [
        "research_speed_factor", "coordination_bonus", "land_reinforce_rate", 
        "land_night_attack", "special_forces_cap", "tech_air_damage_factor", 
        "static_anti_air_damage_factor", "static_anti_air_hit_chance_factor",
        "special_forces_training_time_factor", "special_forces_no_supply_grace", "special_forces_out_of_supply_factor"
    ];
    const ignoredKeys = [ "path", "research_cost", "start_year", "folder", "categories", "ai_will_do", "allow", "allow_branch", "dependencies", "show_equipment_icon", "on_research_complete", "on_research_complete_limit", "special_project_specialization", "show_effect_as_desc", "sub_technologies", "sub_tech_index", "desc", "force_use_small_tech_layout", "enable_building", "xor" ];
    
    const effectFiles = [ 'data/effects/artillery.txt', 'data/effects/electronic_mechanical_engineering.txt', 'data/effects/infantry.txt', 'data/effects/NSB_armor.txt', 'data/effects/support.txt' ];

    for (const file of effectFiles) {
        try {
            const response = await fetch(file);
            if (!response.ok) continue;
            const text = await response.text();
            const parsedData = parseParadoxScript(text);
            
            for (const [techId, data] of Object.entries(parsedData)) {
                if (techId.startsWith('@') || Array.isArray(data)) continue; 
                
                const techEntry = { equipments: [], modules: [], subunits: [], project: null, modifiers: [] };
                if (data.enable_equipments) techEntry.equipments = Array.isArray(data.enable_equipments) ? data.enable_equipments : [data.enable_equipments];
                if (data.enable_equipment_modules) techEntry.modules = Array.isArray(data.enable_equipment_modules) ? data.enable_equipment_modules : [data.enable_equipment_modules];
                if (data.enable_subunits) techEntry.subunits = Array.isArray(data.enable_subunits) ? data.enable_subunits : [data.enable_subunits];

                if (data.on_research_complete) {
                    const orcList = Array.isArray(data.on_research_complete) ? data.on_research_complete : [data.on_research_complete];
                    for (const event of orcList) {
                        if (event.custom_effect_tooltip?.PROJECT) techEntry.project = event.custom_effect_tooltip.PROJECT;
                        else if (event.if?.custom_effect_tooltip?.PROJECT) techEntry.project = event.if.custom_effect_tooltip.PROJECT;
                    }
                }

                for (const [key, value] of Object.entries(data)) {
                    if (ignoredKeys.includes(key) || key.startsWith('enable_')) continue;
                    if (globalModifiersList.includes(key)) {
                        techEntry.modifiers.push({ target: "global", stat: key, value: value });
                    } else if (typeof value === 'object' && !Array.isArray(value)) {
                        for (const [statKey, statVal] of Object.entries(value)) {
                            if (typeof statVal === 'number') techEntry.modifiers.push({ target: key, stat: statKey, value: statVal });
                            else if (typeof statVal === 'object' && !Array.isArray(statVal)) {
                                for (const [terrainStat, tVal] of Object.entries(statVal)) {
                                    if (typeof tVal === 'number') techEntry.modifiers.push({ target: key, stat: `${statKey}_${terrainStat}`, value: tVal });
                                }
                            }
                        }
                    }
                }
                window.dynamicTechDB[techId] = techEntry;
            }
        } catch (error) { console.warn(`Failed to load tech file ${file}`); }
    }
}

async function loadGameDatabases() {
    try {
        const subResponse = await fetch('data/units/unit_file_names.json');
        if (subResponse.ok) {
            const subFiles = await subResponse.json();
            for (const file of subFiles) {
                try {
                    const response = await fetch(`data/units/${file}`);
                    if (!response.ok) continue;
                    const parsed = parseParadoxScript(await response.text());
                    if (parsed.sub_units) Object.assign(window.gameDB.subunits, parsed.sub_units);
                } catch(e) {}
            }
        }
    } catch(e) { console.error("Failed to load units JSON.", e); }
    
    try {
        const eqResponse = await fetch('data/units/equipment/equipment_file_names.json');
        if (eqResponse.ok) {
            const eqFiles = await eqResponse.json();
            for (const file of eqFiles) {
                try {
                    const response = await fetch(`data/units/equipment/${file}`);
                    if (!response.ok) continue;
                    const parsed = parseParadoxScript(await response.text());
                    if (parsed.equipments) Object.assign(window.gameDB.equipments, parsed.equipments);
                } catch(e) {}
            }
        }
    } catch(e) { console.error("Failed to load equipment JSON.", e); }
}

class DynamicBattalion {
    constructor(id) {
        this.id = id;
        this.rawData = window.gameDB.subunits[id] || {};
        this.name = window.getLoc(id); 
        this.modifiers = {};
        this.isUnlocked = false;
    }
    addModifier(stat, value) {
        if (!this.modifiers[stat]) this.modifiers[stat] = 0;
        this.modifiers[stat] += value;
    }
    reset() {
        this.modifiers = {};
        this.isUnlocked = false;
    }
}

window.initializeDynamicBattalions = function() {
    Object.keys(window.gameDB.subunits).forEach(id => {
        const sub = window.gameDB.subunits[id];
        if (!id || typeof sub !== 'object' || id.startsWith('category_') || id === 'limit' || id.includes('archetype')) return;
        window.activeBattalions[id] = new DynamicBattalion(id);
    });
};

window.buildCategoryMap = function() {
    window.unitCategoryMap = {};
    Object.values(window.activeBattalions).forEach(battalion => {
        let cats = battalion.rawData.categories;
        if (!cats) return;
        if (!Array.isArray(cats)) cats = [cats];
        cats.forEach(cat => {
            if (typeof cat !== 'string') return;
            if (!window.unitCategoryMap[cat]) window.unitCategoryMap[cat] = [];
            window.unitCategoryMap[cat].push(battalion);
        });
    });
};

window.resolveTargetToBattalions = function(target) {
    if (window.activeBattalions[target]) return [window.activeBattalions[target]];
    if (window.unitCategoryMap?.[target]) return window.unitCategoryMap[target];
    return [];
};

window.onload = async function() {
    console.log("Loading databases...");
    await Promise.all([
        loadLocalization(),
        loadTechDatabase(),
        loadGameDatabases() 
    ]);
    
    console.log("Databases loaded. Initializing engines...");
    window.initializeDynamicBattalions();
    window.buildCategoryMap();

    if (typeof TechEngine !== 'undefined') {
        window.engine = new TechEngine();
        window.engine.recalculateAll();
    }

    if (typeof DivisionTemplateBuilder !== 'undefined') {
        window.templateBuilder = new DivisionTemplateBuilder();
        window.templateBuilder.initUI();
    }

    if (typeof initializePanning === 'function') initializePanning();
    if (typeof switchTab === 'function') switchTab(currentTab);
};
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
    if (!key) return '';
    let searchKey = String(key).replace('£tech_mod ', '').replace('£pol_idea ', '').trim();
    let altKey = searchKey.replace('motorised', 'motorized').replace('armour', 'armor');

    function resolve(raw) {
        const refMatch = raw.match(/^\$([^$]+)\$$/);
        if (refMatch) return window.getLoc(refMatch[1]);
        return raw;
    }

    if (window.localizationData[searchKey]) return resolve(window.localizationData[searchKey]);
    if (window.localizationData[altKey])    return resolve(window.localizationData[altKey]);

    const modKey = 'MODIFIER_' + searchKey.toUpperCase();
    if (window.localizationData[modKey]) return resolve(window.localizationData[modKey]);

    const statKey = 'STAT_' + searchKey.toUpperCase();
    if (window.localizationData[statKey]) return resolve(window.localizationData[statKey]);

    if (searchKey === 'global') return 'Global Target';
    return key;
};

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
    try {
        const res  = await fetch('/data/gamedata.json');
        const data = await res.json();

        window.localizationData  = data.localizationData  || {};
        window.dynamicTechDB     = data.techDB            || {};
        Object.assign(window.gameDB.subunits,   data.subunits   || {});
        Object.assign(window.gameDB.equipments, data.equipments || {});
    } catch (err) {
        console.error('Failed to load game data:', err);
    }

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

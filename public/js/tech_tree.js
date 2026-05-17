function renderEffect(effect) {
    if (effect.equipmentName && effect.stats) {
        let html = `<div class="tt-line"><span class="tt-equip-icon">[EQ]</span><span class="text-orange">${effect.equipmentName}</span>:</div>`;
        effect.stats.forEach(stat => {
            const colorClass = stat.isPositive ? 'text-green' : 'text-red';
            html += `<div class="tt-line tt-indent">- ${stat.name}: <span class="${colorClass}">${stat.value}</span></div>`;
        });
        return html;
    } else if (effect.equipmentNames) {
        const names = effect.equipmentNames.map(n => `<span class="text-orange">${n}</span>`).join(', ');
        return `<div class="tt-line">Enables ${names}</div>`;
    } else if (effect.moduleNames) {
        let formattedNames = '';
        const arr = [...effect.moduleNames];
        if (arr.length > 1) {
            const last = arr.pop();
            formattedNames = arr.map(n => `<span class="text-orange">${n}</span>`).join(', ') + ` <span class="text-white">and</span> <span class="text-orange">${last}</span>`;
        } else {
            formattedNames = `<span class="text-orange">${arr[0]}</span>`;
        }
        return `<div class="tt-line">Enables ${formattedNames}</div>`;
    } else if (effect.projectName) {
        return `<div class="tt-line">Unlocks Special Project: <span class="text-orange">${effect.projectName}</span></div>`;
    } else if (effect.battalionName) {
        return `<div class="tt-line">Enables <span class="text-orange">${effect.battalionName}</span></div>`;
    } else if (effect.statName) {
        const colorClass = effect.isPositive ? 'text-green' : 'text-red';
        return `<div class="tt-line">${effect.statName}: <span class="${colorClass}">${effect.value}</span></div>`;
    }
    return '';
}

const negativeIsGoodStats = new Set([
    'supply_consumption', 'weight', 'build_cost_ic', 'training_time',
    'fuel_consumption', 'casualty_trickleback', 'experience_loss_factor',
    'maximum_speed'  
]);

function getEffectsForRender(techId) {
    const data = window.dynamicTechDB[techId];
    if (!data) return [];
    
    let effects = [];
    if (data.equipments && data.equipments.length > 0) effects.push({ equipmentNames: data.equipments.map(e => window.getLoc(e)) });
    if (data.modules && data.modules.length > 0) effects.push({ moduleNames: data.modules.map(m => window.getLoc(m)) });
    if (data.subunits && data.subunits.length > 0) data.subunits.forEach(s => effects.push({ battalionName: window.getLoc(s) }));
    if (data.project) effects.push({ projectName: window.getLoc(data.project) });

    if (data.modifiers && data.modifiers.length > 0) {
        let grouped = {};
        data.modifiers.forEach(mod => {
            if (!grouped[mod.target]) grouped[mod.target] = [];
            grouped[mod.target].push(mod);
        });

        for (let target in grouped) {
            let targetName = window.getLoc(target);
            if (target === 'global') {
                grouped[target].forEach(mod => {
                    let statName = window.getLoc(mod.stat);
                    
                    let isPerc = (mod.value <= 1.0 && mod.value >= -1.0) || statName.includes("Speed") || statName.includes("Factor") || statName.includes("Bonus");
                    let sign = mod.value > 0 ? '+' : '';
                    let displayValue = isPerc ? `${sign}${Math.round(mod.value * 100)}%` : `${sign}${mod.value}`;
                    
                    effects.push({ statName: statName, value: displayValue, isPositive: true });
                });
            } else {
                let equipmentStats = { equipmentName: targetName, stats: [] };
                grouped[target].forEach(mod => {
                    let statName = window.getLoc(mod.stat);
                    let isPerc = (mod.value <= 1.0 && mod.value >= -1.0) || statName.includes("Factor");
                    let sign = mod.value > 0 ? '+' : '';
                    let displayValue = isPerc ? `${sign}${Math.round(mod.value * 100)}%` : `${sign}${mod.value}`;
                    equipmentStats.stats.push({ name: statName, value: displayValue, isPositive: true });
                });
                effects.push(equipmentStats);
            }
        }
    }
    return effects;
}

const BUNDLED_TECHS = {
    'motorised_infantry': ['motorized_rocket_unit'],
    'armored_car3':       ['armored_car_at_upgrade'],
};

class TechEngine {
    constructor() {
        this.researchedTechs = new Set();
    }

    toggleTech(techId) {
        const bundled = BUNDLED_TECHS[techId] || [];

        if (this.researchedTechs.has(techId)) {
            this.researchedTechs.delete(techId);
            bundled.forEach(b => this.researchedTechs.delete(b));
        } else {
            this.researchedTechs.add(techId);
            bundled.forEach(b => this.researchedTechs.add(b));
        }

        const saveObj = {};
        this.researchedTechs.forEach(t => saveObj[t] = true);
        this.recalculateAll();
    }

    isResearched(techId) { return this.researchedTechs.has(techId); }

    recalculateAll() {
        window.globalState.reset();
        Object.values(window.activeBattalions).forEach(b => b.reset());
        window.gameDB.activeEquipment = {};

        this.researchedTechs.forEach(techId => {
            const techData = window.dynamicTechDB[techId];
            if (!techData) return;

            if (techData.equipments) {
                techData.equipments.forEach(eq => {
                    window.globalState.enabledEquipments.add(eq);
                    const equipDef = window.gameDB.equipments[eq];
                    if (equipDef && equipDef.archetype) window.gameDB.activeEquipment[equipDef.archetype] = eq;
                    else window.gameDB.activeEquipment[eq] = eq;
                });
            }

            techData.modules.forEach(mod => window.globalState.enabledModules.add(mod));

            if (techData.subunits && techData.subunits.length > 0) {
                techData.subunits.forEach(sub => {
                    if (window.activeBattalions[sub]) window.activeBattalions[sub].isUnlocked = true;
                });
            }

            techData.modifiers.forEach(effect => {
                if (effect.target === "global") {
                    window.globalState.addModifier(effect.stat, effect.value);
                } else {
                    const targetedBattalions = window.resolveTargetToBattalions(effect.target);
                    targetedBattalions.forEach(battalion => battalion.addModifier(effect.stat, effect.value));
                }
            });
        });

        if (window.templateBuilder) {
            setTimeout(() => {
                window.templateBuilder.renderGrid();
                window.templateBuilder.updateStatsUI();
            }, 50);
        }
    }
}

let currentTab = 'inf';

let panX = 0;
let panY = 0;
let currentScale = 1;
let cameraStates = {}; 

let allNodesData = {
    inf: [
        { "id": "support_weapons", "x": 123, "y": 131, "w": 63, "h": 65 },
        { "id": "support_weapons2", "x": 375, "y": 131, "w": 63, "h": 65 },
        { "id": "support_weapons3", "x": 627, "y": 132, "w": 63, "h": 64 },
        { "id": "support_weapons4", "x": 878, "y": 131, "w": 64, "h": 65 },
        { "id": "night_vision", "x": 1003, "y": 130, "w": 65, "h": 66 },
        { "id": "night_vision2", "x": 1384, "y": 129, "w": 62, "h": 69 },
        { "id": "infantry_weapons", "x": 9, "y": 229, "w": 164, "h": 76 },
        { "id": "infantry_weapons1", "x": 198, "y": 228, "w": 166, "h": 78 },
        { "id": "infantry_weapons2", "x": 374, "y": 234, "w": 65, "h": 66 },
        { "id": "improved_infantry_weapons", "x": 451, "y": 229, "w": 166, "h": 77 },
        { "id": "improved_infantry_weapons_2", "x": 628, "y": 234, "w": 63, "h": 68 },
        { "id": "advanced_infantry_weapons", "x": 828, "y": 229, "w": 165, "h": 78 },
        { "id": "advanced_infantry_weapons2", "x": 1130, "y": 234, "w": 65, "h": 65 },
        { "id": "infantry_at", "x": 877, "y": 360, "w": 65, "h": 65 },
        { "id": "infantry_at2", "x": 1002, "y": 360, "w": 68, "h": 66 },
        { "id": "tech_trucks", "x": 9, "y": 493, "w": 166, "h": 78 },
        { "id": "motorised_infantry", "x": 197, "y": 493, "w": 165, "h": 75 },
        { "id": "mechanised_infantry", "x": 575, "y": 491, "w": 167, "h": 79 },
        { "id": "mechanised_infantry2", "x": 828, "y": 493, "w": 166, "h": 77 },
        { "id": "mechanised_infantry3", "x": 1078, "y": 492, "w": 169, "h": 79 },
        { "id": "amphibious_mechanized_infantry", "x": 702, "y": 619, "w": 166, "h": 77 },
        { "id": "amphibious_mechanized_infantry_2", "x": 954, "y": 620, "w": 166, "h": 79 },
        { "id": "armored_car1", "x": 136, "y": 748, "w": 163, "h": 75 },
        { "id": "armored_car2", "x": 576, "y": 746, "w": 164, "h": 79 },
        { "id": "armored_car3", "x": 829, "y": 746, "w": 165, "h": 77 },
        { "id": "marines", "x": 246, "y": 871, "w": 67, "h": 67 },
        { "id": "marines2", "x": 497, "y": 874, "w": 69, "h": 66 },
        { "id": "marines3", "x": 1004, "y": 871, "w": 65, "h": 68 },
        { "id": "paratroopers", "x": 246, "y": 999, "w": 70, "h": 67 },
        { "id": "paratroopers2", "x": 500, "y": 1000, "w": 63, "h": 65 },
        { "id": "paratroopers3", "x": 1004, "y": 998, "w": 68, "h": 67 },
        { "id": "tech_mountaineers", "x": 247, "y": 1093, "w": 67, "h": 66 },
        { "id": "tech_mountaineers2", "x": 499, "y": 1091, "w": 66, "h": 69 },
        { "id": "tech_mountaineers3", "x": 1006, "y": 1094, "w": 63, "h": 64 },
        { "id": "rangers_tech", "x": 247, "y": 1193, "w": 66, "h": 63 },
        { "id": "rangers_tech2", "x": 499, "y": 1193, "w": 65, "h": 62 },
        { "id": "rangers_tech3", "x": 1004, "y": 1194, "w": 64, "h": 62 }
    ],
    sup: [
        { "id": "tech_support", "x": 37, "y": 70, "w": 161, "h": 75 },
        { "id": "tech_engineers", "x": 213, "y": 77, "w": 61, "h": 63 },
        { "id": "tech_engineers2", "x": 464, "y": 77, "w": 65, "h": 64 },
        { "id": "tech_engineers3", "x": 842, "y": 76, "w": 64, "h": 65 },
        { "id": "tech_engineers4", "x": 1221, "y": 75, "w": 62, "h": 65 },
        { "id": "sp_armored_engineer_tech", "x": 337, "y": 138, "w": 69, "h": 67 },
        { "id": "tech_recon", "x": 211, "y": 202, "w": 66, "h": 65 },
        { "id": "tech_recon2", "x": 464, "y": 200, "w": 64, "h": 70 },
        { "id": "tech_recon3", "x": 841, "y": 200, "w": 68, "h": 69 },
        { "id": "tech_recon4", "x": 1220, "y": 198, "w": 68, "h": 71 },
        { "id": "sp_helicopter_artillery_observers_tech", "x": 335, "y": 263, "w": 71, "h": 70 },
        { "id": "tech_military_police", "x": 210, "y": 327, "w": 69, "h": 68 },
        { "id": "tech_military_police2", "x": 462, "y": 325, "w": 70, "h": 71 },
        { "id": "tech_military_police3", "x": 841, "y": 325, "w": 66, "h": 71 },
        { "id": "tech_military_police4", "x": 1219, "y": 327, "w": 69, "h": 68 },
        { "id": "sp_armored_motorized_military_police_tech", "x": 336, "y": 386, "w": 71, "h": 71 },
        { "id": "tech_maintenance_company", "x": 209, "y": 451, "w": 69, "h": 72 },
        { "id": "tech_maintenance_company2", "x": 463, "y": 452, "w": 67, "h": 70 },
        { "id": "tech_maintenance_company3", "x": 841, "y": 452, "w": 68, "h": 70 },
        { "id": "tech_maintenance_company4", "x": 1219, "y": 452, "w": 65, "h": 69 },
        { "id": "sp_armored_maintenance_tech", "x": 337, "y": 515, "w": 69, "h": 67 },
        { "id": "motorised_infantry", "x": 601, "y": 565, "w": 170, "h": 81 },
        { "id": "tech_field_hospital", "x": 211, "y": 643, "w": 66, "h": 67 },
        { "id": "tech_field_hospital2", "x": 463, "y": 644, "w": 67, "h": 66 },
        { "id": "tech_field_hospital3", "x": 840, "y": 642, "w": 70, "h": 69 },
        { "id": "tech_field_hospital4", "x": 1218, "y": 641, "w": 70, "h": 71 },
        { "id": "sp_helicopter_med_evac_tech", "x": 336, "y": 703, "w": 67, "h": 72 },
        { "id": "tech_logistics_company", "x": 211, "y": 767, "w": 66, "h": 70 },
        { "id": "tech_logistics_company2", "x": 463, "y": 768, "w": 65, "h": 67 },
        { "id": "tech_logistics_company3", "x": 839, "y": 766, "w": 68, "h": 70 },
        { "id": "tech_logistics_company4", "x": 1220, "y": 769, "w": 66, "h": 65 },
        { "id": "sp_helicopter_transport_pods_tech", "x": 335, "y": 830, "w": 70, "h": 72 },
        { "id": "radio", "x": 601, "y": 888, "w": 171, "h": 81 },
        { "id": "tech_signal_company", "x": 210, "y": 958, "w": 69, "h": 68 },
        { "id": "tech_signal_company2", "x": 463, "y": 956, "w": 66, "h": 70 },
        { "id": "tech_signal_company3", "x": 840, "y": 956, "w": 68, "h": 70 },
        { "id": "tech_signal_company4", "x": 1219, "y": 956, "w": 69, "h": 70 },
        { "id": "sp_armored_signal_tech", "x": 336, "y": 1019, "w": 70, "h": 71 },
        { "id": "basic_train", "x": 34, "y": 1166, "w": 170, "h": 83 },
        { "id": "wartime_train", "x": 413, "y": 1166, "w": 167, "h": 85 },
        { "id": "armored_train", "x": 225, "y": 1292, "w": 165, "h": 78 },
        { "id": "railway_gun", "x": 225, "y": 1421, "w": 165, "h": 76 }
    ],
    tank: [
        { "id": "gwtank_chassis", "x": 708, "y": 11, "w": 165, "h": 76 },
        { "id": "basic_light_tank_chassis", "x": 518, "y": 135, "w": 167, "h": 77 },
        { "id": "basic_heavy_tank_chassis", "x": 895, "y": 135, "w": 167, "h": 76 },
        { "id": "armor_tech_1", "x": 142, "y": 197, "w": 67, "h": 67 },
        { "id": "engine_tech_1", "x": 239, "y": 196, "w": 66, "h": 69 },
        { "id": "improved_light_tank_chassis", "x": 516, "y": 260, "w": 169, "h": 80 },
        { "id": "armor_tech_2", "x": 142, "y": 326, "w": 72, "h": 66 },
        { "id": "engine_tech_2", "x": 236, "y": 322, "w": 71, "h": 69 },
        { "id": "amphibious_tank_chassis", "x": 327, "y": 324, "w": 171, "h": 78 },
        { "id": "basic_medium_tank_chassis", "x": 707, "y": 324, "w": 167, "h": 77 },
        { "id": "improved_medium_tank_chassis", "x": 706, "y": 449, "w": 168, "h": 79 },
        { "id": "improved_heavy_tank_chassis", "x": 895, "y": 450, "w": 168, "h": 77 },
        { "id": "armor_tech_3", "x": 142, "y": 513, "w": 68, "h": 67 },
        { "id": "engine_tech_3", "x": 237, "y": 512, "w": 68, "h": 68 },
        { "id": "amphibious_drive", "x": 329, "y": 513, "w": 167, "h": 79 },
        { "id": "advanced_light_tank_chassis", "x": 517, "y": 513, "w": 170, "h": 81 },
        { "id": "super_heavy_tank_chassis", "x": 1146, "y": 512, "w": 168, "h": 82 },
        { "id": "sp_armored_advanced_flamethrower_tech", "x": 1387, "y": 511, "w": 69, "h": 70 },
        { "id": "advanced_medium_tank_chassis", "x": 704, "y": 639, "w": 169, "h": 79 },
        { "id": "advanced_heavy_tank_chassis", "x": 894, "y": 637, "w": 166, "h": 79 },
        { "id": "sp_armored_lc_naval_engine_conversion_tech", "x": 1067, "y": 637, "w": 73, "h": 69 },
        { "id": "sp_armored_lc_transmission_improvements_tech", "x": 1195, "y": 636, "w": 72, "h": 71 },
        { "id": "sp_armored_lc_specialized_field_manuals_tech", "x": 1319, "y": 636, "w": 73, "h": 72 },
        { "id": "sp_armored_lc_high_impact_obliterator_cannon_tech", "x": 1446, "y": 635, "w": 73, "h": 73 },
        { "id": "armor_tech_4", "x": 143, "y": 701, "w": 68, "h": 69 },
        { "id": "engine_tech_4", "x": 237, "y": 701, "w": 69, "h": 67 },
        { "id": "main_battle_tank_chassis", "x": 704, "y": 763, "w": 171, "h": 78 },
        { "id": "sp_armored_lc_weapon_fire_control_tech", "x": 1195, "y": 763, "w": 72, "h": 68 }
    ],
    elec: [
        { "id": "electronic_mechanical_engineering", "x": 208, "y": 83, "w": 65, "h": 65 },
        { "id": "basic_fortification_tech", "x": 679, "y": 83, "w": 66, "h": 62 },
        { "id": "atomic_research", "x": 940, "y": 81, "w": 64, "h": 65 },
        { "id": "radio", "x": 100, "y": 191, "w": 68, "h": 65 },
        { "id": "mechanical_computing", "x": 426, "y": 189, "w": 66, "h": 66 },
        { "id": "coastal_fort_tech_1", "x": 732, "y": 190, "w": 66, "h": 67 },
        { "id": "experimental_rockets", "x": 1120, "y": 189, "w": 65, "h": 66 },
        { "id": "basic_fire_control_system", "x": 481, "y": 298, "w": 64, "h": 66 },
        { "id": "sp_rockets_improved_guidance", "x": 1118, "y": 294, "w": 70, "h": 70 },
        { "id": "improved_radio", "x": 103, "y": 406, "w": 65, "h": 68 },
        { "id": "cavity_magnatron", "x": 211, "y": 402, "w": 68, "h": 68 },
        { "id": "computing_machine", "x": 426, "y": 405, "w": 66, "h": 69 },
        { "id": "land_fort_tech_1", "x": 624, "y": 402, "w": 66, "h": 71 },
        { "id": "sp_rockets_dual_chamber_rocket_engine_1", "x": 1012, "y": 404, "w": 70, "h": 68 },
        { "id": "sp_rockets_rocket_bomber", "x": 1227, "y": 403, "w": 71, "h": 69 },
        { "id": "improved_fire_control_system", "x": 479, "y": 514, "w": 67, "h": 68 },
        { "id": "sp_rockets_improved_rocket_bomber", "x": 1227, "y": 511, "w": 65, "h": 70 },
        { "id": "centimetric_radar", "x": 207, "y": 619, "w": 71, "h": 71 },
        { "id": "improved_computing_machine", "x": 424, "y": 622, "w": 69, "h": 68 },
        { "id": "land_fort_tech_2", "x": 622, "y": 620, "w": 70, "h": 69 },
        { "id": "coastal_fort_tech_2", "x": 730, "y": 619, "w": 67, "h": 70 },
        { "id": "sp_rockets_dual_chamber_rocket_engine_2", "x": 1012, "y": 619, "w": 66, "h": 70 },
        { "id": "advanced_radio", "x": 102, "y": 728, "w": 67, "h": 73 },
        { "id": "phased_array", "x": 209, "y": 728, "w": 73, "h": 69 },
        { "id": "advanced_fire_control_system", "x": 483, "y": 730, "w": 65, "h": 68 },
        { "id": "monopulse_radar", "x": 210, "y": 836, "w": 65, "h": 68 },
        { "id": "advanced_computing_machine", "x": 428, "y": 837, "w": 63, "h": 67 }
    ],
    art: [
        { "id": "gw_artillery", "x": 939, "y": 75, "w": 165, "h": 76 },
        { "id": "interwar_antiair", "x": 500, "y": 203, "w": 164, "h": 74 },
        { "id": "interwar_artillery", "x": 990, "y": 202, "w": 65, "h": 65 },
        { "id": "interwar_antitank", "x": 1381, "y": 202, "w": 164, "h": 74 },
        { "id": "antiair1", "x": 548, "y": 328, "w": 66, "h": 64 },
        { "id": "artillery1", "x": 940, "y": 328, "w": 164, "h": 74 },
        { "id": "antitank1", "x": 1429, "y": 328, "w": 67, "h": 64 },
        { "id": "antiair2", "x": 501, "y": 454, "w": 164, "h": 78 },
        { "id": "sp_artillery_purpose_built_gun_motor_carriages_tech", "x": 736, "y": 454, "w": 67, "h": 64 },
        { "id": "sp_artillery_rocket_assisted_projectiles_tech", "x": 862, "y": 453, "w": 68, "h": 67 },
        { "id": "artillery2", "x": 990, "y": 453, "w": 66, "h": 66 },
        { "id": "rocket_artillery", "x": 1130, "y": 455, "w": 167, "h": 78 },
        { "id": "antitank2", "x": 1380, "y": 453, "w": 169, "h": 79 },
        { "id": "sp_shock_hardening_techniques", "x": 419, "y": 578, "w": 74, "h": 68 },
        { "id": "antiair3", "x": 548, "y": 579, "w": 70, "h": 67 },
        { "id": "artillery3", "x": 990, "y": 580, "w": 68, "h": 67 },
        { "id": "rocket_artillery2", "x": 1179, "y": 579, "w": 69, "h": 69 },
        { "id": "antitank3", "x": 1429, "y": 578, "w": 70, "h": 68 },
        { "id": "sp_variable_time_fuze_shells", "x": 422, "y": 703, "w": 70, "h": 71 },
        { "id": "antiair4", "x": 547, "y": 704, "w": 70, "h": 72 },
        { "id": "artillery4", "x": 939, "y": 706, "w": 170, "h": 82 },
        { "id": "rocket_artillery3", "x": 1176, "y": 704, "w": 71, "h": 71 },
        { "id": "sp_land_large_caliber_kinetic_energy_sabot_gd_tech", "x": 1303, "y": 704, "w": 71, "h": 72 },
        { "id": "antitank4", "x": 1430, "y": 704, "w": 67, "h": 69 },
        { "id": "antiair5", "x": 499, "y": 829, "w": 170, "h": 84 },
        { "id": "artillery5", "x": 989, "y": 831, "w": 70, "h": 69 },
        { "id": "rocket_artillery4", "x": 1128, "y": 830, "w": 172, "h": 83 },
        { "id": "antitank5", "x": 1377, "y": 832, "w": 174, "h": 80 }
    ]
};

let nodesData = allNodesData[currentTab];

function applyCamera() {
    const container = document.getElementById('tree-container');
    if (container) {
        container.style.transformOrigin = '0 0';
        container.style.transform = `translate(${panX}px, ${panY}px) scale(${currentScale})`;
    }
}

function switchTab(tabName) {
    
    cameraStates[currentTab] = { panX: panX, panY: panY, scale: currentScale };

    currentTab = tabName;
    nodesData = allNodesData[currentTab];
    const baseImg = document.getElementById('base-image');
    const newSrc = `media/base_${tabName}.png`;

    const doInit = () => {
        initializeTree();
        window.dispatchEvent(new Event('tabSwitched'));
    };

    
    if (baseImg.src.endsWith(newSrc) && baseImg.complete && baseImg.naturalWidth > 0) {
        doInit();
    } else {
        baseImg.onload = doInit;
        baseImg.src = newSrc;
    }
}

function generateTooltipHTML(id) {
    let title = window.getLoc(id);
    
    if (title === id) {
        const data = window.dynamicTechDB[id];
        if (data && data.equipments && data.equipments.length > 0)
            title = window.getLoc(data.equipments[0]);
        else
            title = id;
    }
    
    let html = `<div class="tt-title">${title}</div>`;
    if (window.engine.isResearched(id)) html += `<div class="tt-status">Researched</div>`;

    const effects = getEffectsForRender(id);
    if (effects && effects.length > 0) {
        html += `<div class="tt-effect-header">Effect:</div>`;
        effects.forEach(effect => { html += renderEffect(effect); });
    } else {
        html += `<div class="tt-line text-white">No effects.</div>`;
    }

    
    const bundled = BUNDLED_TECHS[id] || [];
    bundled.forEach(bundledId => {
        const bundledTitle = window.localizationData[bundledId] || bundledId;
        html += `<div class="tt-effect-header" style="margin-top:6px;">Also unlocks: <span class="text-orange">${bundledTitle}</span></div>`;
        const bundledEffects = getEffectsForRender(bundledId);
        if (bundledEffects && bundledEffects.length > 0) {
            bundledEffects.forEach(effect => { html += renderEffect(effect); });
        }
    });

    return html;
}

function initializeTree() {
    const baseImg = document.getElementById('base-image');
    const container = document.getElementById('tree-container');
    const tooltip = document.getElementById('tooltip');

    container.querySelectorAll('.tech-node').forEach(el => el.remove());

    const imgWidth = baseImg.naturalWidth;
    const imgHeight = baseImg.naturalHeight;
    if (imgWidth === 0) return;

    container.style.width = imgWidth + 'px';
    container.style.height = imgHeight + 'px';

   
    const viewport = document.getElementById('viewport');
    const viewWidth = viewport.clientWidth;
    const viewHeight = viewport.clientHeight;
    
    
    if (cameraStates[currentTab] && cameraStates[currentTab].scale) {
        panX = cameraStates[currentTab].panX;
        panY = cameraStates[currentTab].panY;
        currentScale = cameraStates[currentTab].scale;
    } else {
        
        currentScale = 1.0; 
        
        if (imgWidth < viewWidth && imgHeight < viewHeight) {
            
            panX = (viewWidth - imgWidth) / 2;
            panY = (viewHeight - imgHeight) / 2;
        } else {
            
            panX = (viewWidth - imgWidth) / 2;
            panY = 40; 
        }
    }
    applyCamera();

    const overlaySrc = `media/comp_${currentTab}.png`;

    nodesData.forEach(nodeData => {
        let isResearched = window.engine.isResearched(nodeData.id);

        const node = document.createElement('div');
        node.className = 'tech-node';
        if (isResearched) node.classList.add('active');
        
        node.style.left = nodeData.x + 'px';
        node.style.top = nodeData.y + 'px';
        node.style.width = nodeData.w + 'px';
        node.style.height = nodeData.h + 'px';

        const activeImage = document.createElement('img');
        activeImage.src = overlaySrc;
        activeImage.className = 'active-overlay';
        activeImage.style.width = imgWidth + 'px';
        activeImage.style.height = imgHeight + 'px';
        activeImage.style.left = '-' + nodeData.x + 'px';
        activeImage.style.top = '-' + nodeData.y + 'px';
        activeImage.draggable = false;

        node.appendChild(activeImage);
        container.appendChild(node);

        node.addEventListener('click', () => {
            node.classList.toggle('active');
            window.engine.toggleTech(nodeData.id);
            tooltip.innerHTML = generateTooltipHTML(nodeData.id);
        });

        node.addEventListener('mouseenter', () => {
            tooltip.innerHTML = generateTooltipHTML(nodeData.id);
            tooltip.style.display = 'block';
        });

        node.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

        
        node.addEventListener('mousemove', (e) => {
            const tooltipRect = tooltip.getBoundingClientRect();
            let left = e.pageX + 15;
            let top = e.pageY + 15;

            if (e.clientX + 15 + tooltipRect.width > window.innerWidth) {
                left = e.pageX - tooltipRect.width - 15;
            }
            if (e.clientY + 15 + tooltipRect.height > window.innerHeight) {
                top = e.pageY - tooltipRect.height - 15;
            }
            if (left < 0) left = 10;
            if (top < 0) top = 10;

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        });
    });
}

function initializePanning() {
    const viewport = document.getElementById('viewport');
    if (!viewport) return;

    let isDragging = false;
    let startMouseX, startMouseY, initialPanX, initialPanY;

    
    viewport.addEventListener('mousedown', (e) => {
        if (e.target.closest('.tech-node') || e.target.closest('#hoi4-panel')) return; 
        isDragging = true;
        startMouseX = e.pageX;
        startMouseY = e.pageY;
        initialPanX = panX;
        initialPanY = panY;
        viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => { 
        isDragging = false; 
        viewport.style.cursor = 'grab';
    });

    
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        panX = initialPanX + (e.pageX - startMouseX);
        panY = initialPanY + (e.pageY - startMouseY);
        applyCamera();
    });

    
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        
        const zoomSensitivity = 0.1;
        const delta = e.deltaY > 0 ? -1 : 1;
        let newScale = currentScale * (1 + (delta * zoomSensitivity));
        
        
        newScale = Math.max(0.3, Math.min(newScale, 2.5));

        
        const scaleRatio = newScale / currentScale;
        panX = mouseX - (mouseX - panX) * scaleRatio;
        panY = mouseY - (mouseY - panY) * scaleRatio;
        currentScale = newScale;

        applyCamera();
    }, { passive: false });
}

function clearResearch(scope) {
    if (scope === 'tab') {
        const tabNodeIds = new Set((allNodesData[currentTab] || []).map(n => n.id));
        tabNodeIds.forEach(id => window.engine.researchedTechs.delete(id));
    } else {
        window.engine.researchedTechs.clear();
    }

    
    const saveObj = {};
    window.engine.researchedTechs.forEach(t => saveObj[t] = true);

    window.engine.recalculateAll();
    switchTab(currentTab); 

    document.getElementById('clear-research-overlay').classList.remove('visible');
}

function openClearResearchModal() {
    document.getElementById('clear-research-overlay').classList.add('visible');
}

document.addEventListener('DOMContentLoaded', () => {
    
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    
    const overlay = document.getElementById('clear-research-overlay');
    
    document.getElementById('open-clear-research-btn')?.addEventListener('click', openClearResearchModal);
    document.getElementById('cr-tab-btn')?.addEventListener('click', () => clearResearch('tab'));
    document.getElementById('cr-all-btn')?.addEventListener('click', () => clearResearch('all'));
    document.getElementById('cr-cancel-btn')?.addEventListener('click', () => overlay.classList.remove('visible'));
    
    overlay?.addEventListener('click', e => { 
        if (e.target === overlay) overlay.classList.remove('visible'); 
    });

});
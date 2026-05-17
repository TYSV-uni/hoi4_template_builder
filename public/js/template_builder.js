class DivisionTemplateBuilder {
    constructor() {
        this.supportSlots = new Array(5).fill(null);
        this.combatSlots = Array.from({ length: 5 }, () => new Array(5).fill(null));
        this.activeSlotInfo = null;
        this.currentTemplateName = null;
        this.viewMode = false;
        this._templates = {};
    }

    initUI() {
        const tabs = document.getElementById('menu-tabs');
        if (tabs && !document.getElementById('tb-open-btn')) {
            const openBtn = document.createElement('button');
            openBtn.id = 'tb-open-btn';
            openBtn.innerText = 'Division Designer';

            tabs.appendChild(openBtn);
            
            openBtn.onclick = () => this.toggleOverlay(true);
        }

        const closeBtn = document.getElementById('hoi4-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.toggleOverlay(false));

        const overlay = document.getElementById('tb-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target.id === 'tb-overlay') this.toggleOverlay(false);
            });
        }

        
        const panel = document.getElementById('hoi4-panel');
        if (panel) {
            panel.addEventListener('click', (e) => {
                const picker = document.getElementById('hoi4-picker');
                if (picker && picker.style.display !== 'none' && !picker.contains(e.target)) {
                    this.closePicker();
                }
            });
        }

        this.renderGrid();
        this.updateStatsUI();
        this.initTemplateUI();
    }

    toggleOverlay(show) {
        const overlay = document.getElementById('tb-overlay');
        if (!overlay) return;

        if (show) {
            if (window.engine) window.engine.recalculateAll();
            overlay.classList.add('visible');
            this.renderGrid();
            this.updateStatsUI();
            this.renderTemplateList();
        } else {
            overlay.classList.remove('visible');
            this.closePicker();
        }
    }

    renderGrid() {
        const supportCol = document.querySelector('.hoi4-support-col');
        const combatGrid = document.querySelector('.hoi4-combat-grid');
        if (!supportCol || !combatGrid) return;

        supportCol.innerHTML = '';
        for (let row = 0; row < 5; row++) {
            supportCol.appendChild(this.createSlotElement(this.supportSlots[row], 'support', 0, row));
        }

        combatGrid.innerHTML = '';
        for (let col = 0; col < 5; col++) {
            const colDiv = document.createElement('div');
            colDiv.className = 'hoi4-combat-col';
            for (let row = 0; row < 5; row++) {
                colDiv.appendChild(this.createSlotElement(this.combatSlots[col][row], 'combat', col, row));
            }
            combatGrid.appendChild(colDiv);
        }

        this.updateButtonsUI();
    }

    hasCombatBattalions() {
        return this.combatSlots.some(col => col.some(slot => slot !== null));
    }

    hasUnsavedChanges() {
        const nameInput = document.getElementById('hoi4-template-name');
        const currentNameInput = nameInput ? nameInput.value.trim() : "";

        
        if (!this.currentTemplateName) {
            const hasUnits = this.supportSlots.some(s => s !== null) || this.combatSlots.some(col => col.some(s => s !== null));
            return hasUnits || currentNameInput !== "New Division Template";
        }

        
        if (currentNameInput !== this.currentTemplateName) return true;

        
        const saved = this.getSavedTemplates()[this.currentTemplateName];
        if (!saved) return true;

        for (let i = 0; i < 5; i++) {
            if (this.supportSlots[i] !== saved.supportSlots[i]) return true;
        }

        for (let c = 0; c < 5; c++) {
            for (let r = 0; r < 5; r++) {
                if (this.combatSlots[c][r] !== saved.combatSlots[c][r]) return true;
            }
        }

        return false;
    }

    updateButtonsUI() {
        const saveBtn   = document.getElementById('tb-template-save');
        const nameInput = document.getElementById('hoi4-template-name');
        const dupBtn    = document.getElementById('tb-template-duplicate');
        const resetBtn  = document.getElementById('tb-template-reset');

        
        if (this.viewMode) {
            if (saveBtn)  { saveBtn.disabled  = true;  saveBtn.classList.add('disabled');    saveBtn.dataset.error = ''; }
            if (resetBtn) { resetBtn.disabled = true;  resetBtn.classList.add('disabled'); }
            if (dupBtn)   { dupBtn.disabled   = false; dupBtn.classList.remove('disabled'); }
            return;
        }

        if (!saveBtn || !nameInput) return;

        const name      = nameInput.value.trim();
        const templates = this.getSavedTemplates();

        let errorMessage = "";

        if (!name) {
            errorMessage = "Please enter a template name";
        } else if (!this.hasCombatBattalions()) {
            errorMessage = "You need to add a Combat battalion to create a new Division Template";
        } else if (templates[name] && this.currentTemplateName !== name) {
            errorMessage = "Another division template with the same name already exists";
        } else if (!this.hasUnsavedChanges()) {
            errorMessage = "NO_CHANGES"; 
        }

        if (errorMessage) {
            saveBtn.disabled = true;
            saveBtn.classList.add('disabled');
            
            saveBtn.dataset.error = errorMessage === "NO_CHANGES" ? "" : errorMessage;
        } else {
            saveBtn.disabled = false;
            saveBtn.classList.remove('disabled');
            saveBtn.dataset.error = "";

            const tooltip = document.getElementById('tooltip');
            if (tooltip) tooltip.style.display = 'none';
        }

        
        if (dupBtn) {
            const isNew = !this.currentTemplateName;
            dupBtn.disabled = isNew;
            dupBtn.classList.toggle('disabled', isNew);
        }

        
        if (resetBtn) {
            const noChanges = !this.hasUnsavedChanges();
            resetBtn.disabled = noChanges;
            resetBtn.classList.toggle('disabled', noChanges);
        }
    }

    createSlotElement(unitId, type, col, row) {
        const slot = document.createElement('div');
        slot.className = 'hoi4-slot';

        const colToLeftFilled = type !== 'combat' || col === 0
            || this.combatSlots[col - 1].some(s => s !== null);
        const prevFilled = colToLeftFilled && (row === 0 || (
            type === 'support'
                ? this.supportSlots[row - 1] !== null
                : this.combatSlots[col][row - 1] !== null
        ));

        if (unitId && window.gameDB?.subunits?.[unitId]) {
            slot.classList.add('filled');
            const display = this.getUnitDisplay(unitId, window.gameDB.subunits[unitId]);
            slot.innerHTML = `<span style="color:${display.color}; font-weight:bold;">${display.label}</span>`;
            if (!this.viewMode) {
                slot.oncontextmenu = (e) => { e.preventDefault(); this.removeUnit(type, col, row); };
                slot.onclick = (e) => { e.stopPropagation(); this.openPicker(type, col, row); };
            }
        } else if (prevFilled) {
            slot.innerHTML = '+';
            if (!this.viewMode) {
                slot.onclick = (e) => { e.stopPropagation(); this.openPicker(type, col, row); };
            }
        } else {
            slot.classList.add('locked');
            slot.innerHTML = '·';
        }

        return slot;
    }

    getUnitDisplay(id, subData) {
        const abv = subData.abbreviation || id.substring(0, 3).toUpperCase();
        let color = '#ccc';

        if (subData.group_category === 'support_battalions' || subData.combat_width === 0) {
            color = '#55cc55'; 
        } else {
            switch (this.getCombatCategory(id, subData)) {
                case 'Infantry Battalions':               color = '#aaffff'; break;
                case 'Mobile Battalions':                 color = '#ff88ff'; break;
                case 'Mobile Combat Support Battalions':  color = '#ffcc55'; break;
                case 'Armored Battalions':                color = '#ffaa00'; break;
                case 'Armored Combat Support Battalions': color = '#ff6600'; break;
                case 'Combat Support Battalions':         color = '#ff5555'; break;
            }
        }

        return { label: abv, color };
    }

    getColumnType(col) {
        for (let row = 0; row < 5; row++) {
            const unitId = this.combatSlots[col][row];
            if (unitId && window.gameDB?.subunits?.[unitId]) {
                return this.getCombatCategory(unitId, window.gameDB.subunits[unitId]);
            }
        }
        return null;
    }

    getCombatCategory(id, data) {
        
        let cats = [];
        if (Array.isArray(data.categories)) cats = data.categories;
        else if (typeof data.categories === 'string') cats = [data.categories];
        else if (typeof data.categories === 'object' && data.categories !== null) {
            cats = Object.keys(data.categories).filter(k => data.categories[k]);
        }

        const group = data.group || '';

        
        const isArmored = data.map_icon_category === 'armored' || group === 'armor' || cats.includes('category_armored');
        const isMobile = group === 'mobile' || cats.includes('category_mobile_and_mobile_combat_sup') ||
                         id.includes('motorized') || id.includes('mechanized') || id.includes('mot_') || id.startsWith('truck_') ||
                         id.includes('cavalry') || id.includes('camelry') || id.includes('armored_car') || id.includes('amtrac');
        const isCombatSupport = group === 'combat_support' || cats.includes('category_artillery') || cats.includes('category_anti_tank') || cats.includes('category_anti_air') ||
                                id.includes('artillery') || id.includes('anti_tank') || id.includes('anti-tank') || id.includes('anti_air') || id.includes('anti-air') || id.includes('rocket');

        if (isArmored) {
            if (isCombatSupport || id.includes('destroyer') || id.includes('sp_art') || id.includes('sp_anti') || id.includes('spaa') || id.includes('tank_artillery') || id.includes('tank_anti')) {
                return 'Armored Combat Support Battalions';
            }
            return 'Armored Battalions';
        }

        if (isMobile) {
            if (isCombatSupport) {
                return 'Mobile Combat Support Battalions';
            }
            return 'Mobile Battalions';
        }

        if (isCombatSupport) {
            return 'Combat Support Battalions';
        }

        return 'Infantry Battalions';
    }

    getSupportCategory(id) {
        if (id.includes('recon') || id === 'recon') return 'Recon';
        if (id.includes('artillery') || id.includes('anti_tank') ||
            id.includes('anti-tank') || id.includes('anti_air')  ||
            id.includes('anti-air'))                              
            return 'Artillery Support';
        return 'Basic Support';
    }

    
    openPicker(type, col, row) {
        this.activeSlotInfo = { type, col, row };
        const picker = document.getElementById('hoi4-picker');
        if (!picker) return;

        picker.innerHTML = `<div class="picker-hdr">Select Battalion</div><div class="picker-list"></div>`;
        const list = picker.querySelector('.picker-list');

        const current = type === 'support' ? this.supportSlots[row] : this.combatSlots[col][row];
        if (current) {
            const remove = document.createElement('div');
            remove.className = 'picker-item';
            remove.innerHTML = '<span style="color:#ff5555;">[X] Remove</span>';
            remove.onclick = () => this.removeUnit(type, col, row);
            list.appendChild(remove);
        }

        const available = this.getAvailableSubunits(type);
        const lockedType = (type === 'combat') ? this.getColumnType(col) : null;

        let filteredAvailable;
        if (type === 'support') {
            
            const placedSupport = new Set(
                this.supportSlots.filter(s => s !== null)
            );
            filteredAvailable = available.filter(({ id }) => !placedSupport.has(id));
        } else {
            
            const isFirstSlot = row === 0;
            filteredAvailable = available.filter(({ id, data }) => {
                if (id === current) return false;
                if (lockedType && !isFirstSlot) return this.getCombatCategory(id, data) === lockedType;
                return true;
            });
        }

        if (filteredAvailable.length === 0) {
            const msg = document.createElement('div');
            msg.className = 'picker-item';
            msg.style.color = '#777';
            msg.textContent = type === 'support'
                ? 'All available support companies are already placed.'
                : 'Research units in the tech tree to unlock them.';
            list.appendChild(msg);
            picker.style.display = 'flex';
            return;
        }

        const combatOrder   = ['Infantry Battalions', 'Mobile Battalions', 'Mobile Combat Support Battalions', 'Armored Battalions', 'Armored Combat Support Battalions', 'Combat Support Battalions'];
        const supportOrder  = ['Basic Support', 'Artillery Support', 'Recon'];
        const groupOrder    = type === 'support' ? supportOrder : combatOrder;

        const groups = {};
        groupOrder.forEach(g => { groups[g] = []; });

        filteredAvailable.forEach(({ id, data }) => {
            const cat = type === 'support'
                ? this.getSupportCategory(id)
                : this.getCombatCategory(id, data);
            const key = groups[cat] !== undefined ? cat : groupOrder[groupOrder.length - 1];
            groups[key].push({ id, data });
        });

        groupOrder.forEach(groupName => {
            const units = groups[groupName];
            if (!units || units.length === 0) return;

            const hdr = document.createElement('div');
            hdr.className = 'picker-group-hdr';
            hdr.textContent = groupName;
            list.appendChild(hdr);

            units.forEach(({ id, data }) => {
                const item = document.createElement('div');
                item.className = 'picker-item';
                const display = this.getUnitDisplay(id, data);
                item.innerHTML = `<span style="color:${display.color}">${display.label}</span> ${id.replace(/_/g, ' ')}`;
                item.onclick = () => this.assignUnit(id);
                list.appendChild(item);
            });
        });

        picker.style.display = 'flex';
    }

    closePicker() {
        const picker = document.getElementById('hoi4-picker');
        if (picker) picker.style.display = 'none';
        this.activeSlotInfo = null;
    }

    getAvailableSubunits(slotType) {
        if (!window.gameDB?.subunits) return [];
        const available = [];

        Object.keys(window.gameDB.subunits).forEach(id => {
            const sub = window.gameDB.subunits[id];
            if (typeof sub !== 'object' || id === 'limit' || id === 'category_limit') return;

            const isSupport = sub.group_category === 'support_battalions' || sub.combat_width === 0 ||
                             (sub.type && typeof sub.type === 'string' && sub.type.includes('support')) ||
                             id.includes('company') || id.includes('support') || id === 'engineer' ||
                             id === 'recon' || id === 'signal' || id === 'field_hospital' ||
                             id === 'logistics' || id === 'maintenance' || id === 'military_police';

            if (slotType === 'support' && !isSupport) return;
            if (slotType === 'combat' && isSupport) return;

            let unlocked = false;

            if (window.activeBattalions[id]) unlocked = window.activeBattalions[id].isUnlocked;

            if (!unlocked) {
                if (id === "artillery_brigade" || id === "artillery") unlocked = window.engine?.isResearched("gw_artillery") || false;
                else if (id === "rocket_artillery_brigade" || id === "rocket_artillery") unlocked = window.engine?.isResearched("rocket_artillery") || false;
                else if (id === "anti_air_brigade" || id === "anti_air" || id === "anti-air_brigade" || id === "anti-air") unlocked = window.engine?.isResearched("interwar_antiair") || false;
                else if (id === "anti_tank_brigade" || id === "anti_tank") unlocked = window.engine?.isResearched("interwar_antitank") || false;
                else if (id === 'cavalry' || id === 'camelry') unlocked = window.activeBattalions['infantry']?.isUnlocked || false;
            }

            if (!unlocked && window.engine?.researchedTechs && window.dynamicTechDB) {
                for (const techId of window.engine.researchedTechs) {
                    if (window.dynamicTechDB[techId]?.subunits?.includes(id)) {
                        unlocked = true;
                        break;
                    }
                }
            }

            if (unlocked) available.push({ id, data: sub });
        });

        return available.sort((a, b) => a.id.localeCompare(b.id));
    }

    assignUnit(unitId) {
        if (!this.activeSlotInfo) return;
        const { type, col, row } = this.activeSlotInfo;

        if (type === 'combat' && row === 0) {
            const newData = window.gameDB?.subunits?.[unitId];
            const newCategory = newData ? this.getCombatCategory(unitId, newData) : null;
            const oldCategory = this.getColumnType(col);

            
            if (oldCategory && newCategory && newCategory !== oldCategory) {
                this.combatSlots[col] = this.combatSlots[col].map(s => s !== null ? unitId : null);
                this.closePicker();
                this.renderGrid();
                this.updateStatsUI();
                return;
            }
        }

        if (type === 'support') this.supportSlots[row] = unitId;
        else this.combatSlots[col][row] = unitId;

        this.closePicker();
        this.renderGrid();
        this.updateStatsUI();
    }

    removeUnit(type, col, row) {
        if (type === 'support') {
            for (let r = row; r < 4; r++) this.supportSlots[r] = this.supportSlots[r + 1];
            this.supportSlots[4] = null;
        } else {
            for (let r = row; r < 4; r++) this.combatSlots[col][r] = this.combatSlots[col][r + 1];
            this.combatSlots[col][4] = null;

            if (this.combatSlots[col].every(s => s === null)) {
                for (let c = col; c < 4; c++) {
                    this.combatSlots[c] = [...this.combatSlots[c + 1]];
                }
                this.combatSlots[4] = new Array(5).fill(null);
            }
        }

        this.closePicker();
        this.renderGrid();
        this.updateStatsUI();
    }

    equipmentMatchesRequirement(eqId, reqName) {
        let currentId = eqId;
        let visited = new Set();

        while (currentId && !visited.has(currentId)) {
            if (currentId === reqName) return true;
            visited.add(currentId);
            const eq = window.gameDB?.equipments?.[currentId];
            if (!eq) break;

            if (eq.type) {
                if (Array.isArray(eq.type) && eq.type.includes(reqName)) return true;
                if (eq.type === reqName) return true;
            }
            let nextId = eq.parent || eq.archetype;
            if (Array.isArray(nextId)) nextId = nextId[nextId.length - 1];
            currentId = nextId;
        }
        return false;
    }

    getBestEquipment(reqName) {
        if (!window.gameDB?.equipments) return null;
        let best = null, bestYear = -1, baseline = null, baselineYear = 9999;

        for (const [eqId, eq] of Object.entries(window.gameDB.equipments)) {
            if (!this.equipmentMatchesRequirement(eqId, reqName)) continue;

            const isArchetype = eq.is_archetype === 'yes' || eq.is_archetype === true;
            if (isArchetype && eqId !== reqName) continue;

            const eqYear = eq.year || 1936;
            if (eqYear < baselineYear || (eqYear === baselineYear && eqId.endsWith('_0'))) {
                baseline = eq;
                baselineYear = eqYear;
            }

            let unlocked = false;
            if (window.engine?.researchedTechs && window.dynamicTechDB) {
                for (const techId of window.engine.researchedTechs) {
                    if (window.dynamicTechDB[techId]?.equipments?.includes(eqId)) {
                        unlocked = true;
                        break;
                    }
                }
            }

            if (unlocked && eqYear > bestYear) {
                best = eq;
                bestYear = eqYear;
            }
        }
        return best || baseline;
    }

    getEquipmentStat(eq, statKey) {
        if (!eq) return 0;
        let current = eq;
        let visited = new Set();

        while (current && !visited.has(current)) {
            visited.add(current);
            if (current[statKey] !== undefined) return current[statKey];

            let nextId = current.parent || current.archetype;
            if (Array.isArray(nextId)) nextId = nextId[nextId.length - 1];
            if (!nextId) break;
            current = window.gameDB.equipments[nextId];
        }
        return 0;
    }

    
    calculateDivisionStats() {
        const stats = {
            
            total_ic: 0, soft_attack: 0, hard_attack: 0, defense: 0, breakthrough: 0,
            max_speed: 999, armor: 0, piercing: 0, combat_width: 0,
            hardnessSum: 0, batCount: 0, maxArmor: 0, maxPiercing: 0,

            
            hp: 0,
            orgSum: 0,
            recoverySum: 0,
            recon: 0,
            suppression: 0,
            weight: 0,
            supply: 0,
            reliabilitySum: 0,
            reliabilityCount: 0,
            tricklebackSum: 0,
            exp_lossSum: 0,

            
            air_attack: 0,
            initiativeSum: 0,
            entrenchment: 0,
            eq_captureSum: 0,

            
            manpower: 0,
            training_time: 0,
            fuel_capacity: 0,
            fuel_usage: 0,
            needs: {},
            terrain_sums: {}
        };

        const processUnit = (unitId) => {
            if (!unitId || !window.gameDB.subunits[unitId]) return;
            const sub = window.gameDB.subunits[unitId];
            stats.batCount++;

            const terrains = ['forest', 'hills', 'mountain', 'jungle', 'marsh', 'plains', 'desert', 'urban', 'fort', 'river', 'amphibious'];
            terrains.forEach(t => {
                if (sub[t]) {
                    if (!stats.terrain_sums[t]) stats.terrain_sums[t] = { attack: 0, defense: 0, movement: 0 };
                    stats.terrain_sums[t].attack += sub[t].attack || 0;
                    stats.terrain_sums[t].defense += sub[t].defense || 0;
                    stats.terrain_sums[t].movement += sub[t].movement || 0;
                }
            });
            
            
            let width = sub.combat_width !== undefined
                ? sub.combat_width
                : (sub.group_category === 'support_battalions' ? 0 : 2);
            if (width !== 0 && unitId.includes('artillery') && !unitId.includes('support'))
                width = sub.combat_width ?? 3;
            stats.combat_width += width;

            
            stats.hp           += sub.max_strength || 0;
            stats.orgSum       += sub.max_organisation || 0;
            stats.recoverySum  += sub.default_morale || 0;
            stats.recon        += sub.recon || 0;
            stats.suppression  += sub.suppression || 0;
            stats.weight       += sub.weight || 0;
            stats.supply       += sub.supply_consumption || 0;
            stats.tricklebackSum += sub.casualty_trickleback || 0;
            stats.exp_lossSum  += sub.experience_loss_factor || 0;

            
            stats.air_attack   += sub.air_attack || 0;
            stats.initiativeSum += sub.initiative || 0;
            stats.entrenchment += sub.entrenchment || 0;
            stats.eq_captureSum += sub.equipment_capture_factor || 0;

            
            stats.manpower     += sub.manpower || 0;
            stats.training_time = Math.max(stats.training_time, sub.training_time || 0);

            
            if (sub.need) {
                Object.entries(sub.need).forEach(([reqName, amount]) => {
                    stats.needs[reqName] = (stats.needs[reqName] || 0) + amount;
                });
            }

            
            let batStats = {
                soft_attack: 0, hard_attack: 0, defense: 0, breakthrough: 0,
                armor_value: sub.armor_value || 0,
                ap_attack: sub.ap_attack || 0,
                maximum_speed: sub.maximum_speed > 0 ? sub.maximum_speed : 999,
                hardness: sub.hardness || 0
            };
            let statMultipliers = { soft_attack: 1, hard_attack: 1, defense: 1, breakthrough: 1 };

            ['soft_attack', 'hard_attack', 'defense', 'breakthrough'].forEach(stat => {
                if (sub[stat] !== undefined) {
                    if (sub[stat] < 1.0 && sub[stat] > -1.0 && sub[stat] !== 0)
                        statMultipliers[stat] += sub[stat];
                    else
                        batStats[stat] += sub[stat];
                }
            });

            if (sub.need) {
                Object.entries(sub.need).forEach(([req, amount]) => {
                    const eq = this.getBestEquipment(req);
                    if (eq) {
                        batStats.soft_attack   += this.getEquipmentStat(eq, 'soft_attack');
                        batStats.hard_attack   += this.getEquipmentStat(eq, 'hard_attack');
                        batStats.defense       += this.getEquipmentStat(eq, 'defense');
                        batStats.breakthrough  += this.getEquipmentStat(eq, 'breakthrough');
                        batStats.armor_value    = Math.max(batStats.armor_value,  this.getEquipmentStat(eq, 'armor_value'));
                        batStats.ap_attack      = Math.max(batStats.ap_attack,    this.getEquipmentStat(eq, 'ap_attack'));

                        const eqHardness = this.getEquipmentStat(eq, 'hardness');
                        if (eqHardness > 0) batStats.hardness = Math.max(batStats.hardness, eqHardness);

                        const eqSpeed = this.getEquipmentStat(eq, 'maximum_speed');
                        if (eqSpeed > 0) batStats.maximum_speed = Math.min(batStats.maximum_speed, eqSpeed);

                        
                        const fc = this.getEquipmentStat(eq, 'fuel_capacity');
                        const fu = this.getEquipmentStat(eq, 'fuel_consumption');
                        if (fc > 0) stats.fuel_capacity += fc * amount;
                        if (fu > 0) stats.fuel_usage    += fu * amount;

                        
                        const rel = this.getEquipmentStat(eq, 'reliability');
                        if (rel > 0) {
                            stats.reliabilitySum   += rel;
                            stats.reliabilityCount += 1;
                        }

                        
                        stats.air_attack += this.getEquipmentStat(eq, 'air_attack') || 0;

                        const build_cost = this.getEquipmentStat(eq, 'build_cost_ic') || 0;
                        stats.total_ic += (build_cost * amount);
                    }
                });
            }

            if (batStats.maximum_speed === 999) batStats.maximum_speed = 4;

            if (window.activeBattalions && window.activeBattalions[unitId]) {
                const b = window.activeBattalions[unitId];
                if (b.modifiers) {
                    for (let key in b.modifiers) {
                        if (batStats[key] !== undefined) {
                            statMultipliers[key] += b.modifiers[key];
                            const globalMod = window.globalState?.modifiers[key] || 0;
                            if (globalMod !== 0) batStats[key] *= (1 + globalMod);
                        }
                    }
                }
            }

            batStats.soft_attack  *= statMultipliers.soft_attack;
            batStats.hard_attack  *= statMultipliers.hard_attack;
            batStats.defense      *= statMultipliers.defense;
            batStats.breakthrough *= statMultipliers.breakthrough;

            stats.soft_attack  += batStats.soft_attack;
            stats.hard_attack  += batStats.hard_attack;
            stats.defense      += batStats.defense;
            stats.breakthrough += batStats.breakthrough;
            stats.hardnessSum  += batStats.hardness;
            stats.max_speed     = Math.min(stats.max_speed, batStats.maximum_speed);
            stats.armor        += batStats.armor_value;
            stats.maxArmor      = Math.max(stats.maxArmor, batStats.armor_value);
            stats.piercing     += batStats.ap_attack;
            stats.maxPiercing   = Math.max(stats.maxPiercing, batStats.ap_attack);
        };

        this.supportSlots.forEach(processUnit);
        this.combatSlots.forEach(col => col.forEach(processUnit));

        if (stats.batCount === 0) return null;

        
        stats.org        = stats.orgSum      / stats.batCount;
        stats.recovery   = stats.recoverySum / stats.batCount;
        stats.trickleback = stats.tricklebackSum / stats.batCount;
        stats.exp_loss   = stats.exp_lossSum  / stats.batCount;
        stats.initiative = stats.initiativeSum / stats.batCount;
        stats.eq_capture = stats.eq_captureSum / stats.batCount;

        
        stats.reliability = stats.reliabilityCount > 0
            ? (stats.reliabilitySum / stats.reliabilityCount) * 100
            : 0;

        
        stats.armor    = (0.3 * stats.maxArmor)    + (0.7 * (stats.armor    / stats.batCount));
        stats.piercing = (0.3 * stats.maxPiercing) + (0.7 * (stats.piercing / stats.batCount));
        stats.hardness = (stats.hardnessSum / stats.batCount) * 100;

        if (stats.max_speed === 999) stats.max_speed = 4;

        
        stats.terrain_modifiers = {};
        for (let t in stats.terrain_sums) {
            stats.terrain_modifiers[t] = {
                attack: stats.terrain_sums[t].attack / stats.batCount,
                defense: stats.terrain_sums[t].defense / stats.batCount,
                movement: stats.terrain_sums[t].movement / stats.batCount
            };
        }
        
        return stats;
    }

    
    updateStatsUI() {
        const stats = this.calculateDivisionStats();

        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        const f  = (v, d = 1) => (v != null ? (+v).toFixed(d) : '0');
        const fp = (v, d = 1) => f(v, d) + '%';

        if (!stats) {
            
            const resetIds = [
                'stat-speed','stat-hp','stat-org','stat-rec','stat-recon','stat-supp',
                'stat-wgt','stat-sply','stat-tri','stat-exploss',
                'stat-soft','stat-hard','stat-air','stat-def','stat-brk','stat-arm','stat-ap',
                'stat-ent','stat-width','stat-man','stat-tt','stat-fc','stat-fu'
            ];
            resetIds.forEach(id => set(id, '0'));
            set('stat-hrd', '0%');
            set('stat-rel', '0%');
            set('stat-ini', '0.00%');
            set('stat-cap', '0%');
            const eqList = document.getElementById('stat-equip-list');
            if (eqList) eqList.innerHTML = '';
            return;
        }

        
        set('stat-speed',   f(stats.max_speed) + ' km/h');
        set('stat-hp',      f(stats.hp, 1));
        set('stat-org',     f(stats.org));
        set('stat-rec',     f(stats.recovery, 2));
        set('stat-recon',   f(stats.recon, 1));
        set('stat-supp',    f(stats.suppression, 1));
        set('stat-wgt',     f(stats.weight, 1));
        set('stat-sply',    f(stats.supply, 2));
        set('stat-rel',     fp(stats.reliability));
        set('stat-tri',     fp(stats.trickleback * 100));
        set('stat-exploss', fp(stats.exp_loss * 100, 2));
        set('stat-hrd',     fp(stats.hardness));

        
        set('stat-soft',  f(stats.soft_attack));
        set('stat-hard',  f(stats.hard_attack));
        set('stat-air',   f(stats.air_attack));
        set('stat-def',   f(stats.defense));
        set('stat-brk',   f(stats.breakthrough));
        set('stat-arm',   f(stats.armor));
        set('stat-ap',    f(stats.piercing));
        set('stat-ini',   fp(stats.initiative * 100, 2));
        set('stat-ent',   f(stats.entrenchment, 0));
        set('stat-cap',   fp(stats.eq_capture * 100, 0));
        set('stat-width', f(stats.combat_width, 0));

        
        set('stat-man', Math.round(stats.manpower).toString());
        set('stat-tt',  Math.round(stats.training_time).toString());
        set('stat-fc',  f(stats.fuel_capacity));
        set('stat-fu',  f(stats.fuel_usage, 2));

        
        const eqList = document.getElementById('stat-equip-list');
        if (eqList) {
            eqList.innerHTML = '';
            
            const priorityOrder = [
                'infantry_equipment','support_equipment','artillery_equipment',
                'anti_tank_equipment','anti_air_equipment','motorized_equipment',
                'mechanized_equipment','light_tank_equipment','medium_tank_equipment',
                'heavy_tank_equipment'
            ];
            const sortedNeeds = Object.entries(stats.needs).sort(([a], [b]) => {
                const ai = priorityOrder.indexOf(a);
                const bi = priorityOrder.indexOf(b);
                if (ai !== -1 && bi !== -1) return ai - bi;
                if (ai !== -1) return -1;
                if (bi !== -1) return 1;
                return a.localeCompare(b);
            });

            sortedNeeds.forEach(([reqName, amount]) => {
                const row = document.createElement('div');
                row.className = 'equip-need-row';
                const nameEl = document.createElement('span');
                nameEl.className = 'sn';
                nameEl.textContent = this.getEquipmentDisplayName(reqName);
                const valEl = document.createElement('span');
                valEl.className = 'sv';
                valEl.textContent = Math.round(amount).toString();
                row.appendChild(nameEl);
                row.appendChild(valEl);
                eqList.appendChild(row);
            });

            
            const footerCost = document.getElementById('footer-cost-display');
            if (footerCost) {
                footerCost.textContent = `Production Cost: ${f(stats.total_ic, 1)} IC`;
            }
        }

            
        const adjList = document.getElementById('stat-adjusters-list');
        if (adjList) {
            adjList.innerHTML = '';
            
            
            const formatMod = (val) => {
                if (!val || Math.abs(val) < 0.001) return `<span class="val-neu">0.0%</span>`;
                const pct = (val * 100).toFixed(1);
                if (val > 0) return `<span class="val-pos">+${pct}%</span>`;
                return `<span class="val-neg">${pct}%</span>`;
            };

            if (stats && stats.terrain_modifiers) {
                for (let t in stats.terrain_modifiers) {
                    const mods = stats.terrain_modifiers[t];
                    
                    if (mods.attack === 0 && mods.defense === 0 && mods.movement === 0) continue;
                    
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="adj-name">${t}</td>
                        <td class="adj-val">${formatMod(mods.movement)}</td>
                        <td class="adj-val">${formatMod(mods.attack)}</td>
                        <td class="adj-val">${formatMod(mods.defense)}</td>
                    `;
                    adjList.appendChild(row);
                }
            }
        }
    }

    
    getEquipmentDisplayName(reqName) {
        const map = {
            'infantry_equipment':         'Infantry Eq.',
            'support_equipment':          'Support Eq.',
            'anti_air_equipment':         'Anti-Air',
            'anti_tank_equipment':        'Anti-Tank',
            'artillery_equipment':        'Artillery',
            'medium_tank_equipment':      'Medium Tank',
            'heavy_tank_equipment':       'Heavy Tank',
            'light_tank_equipment':       'Light Tank',
            'super_heavy_tank_equipment': 'S.Heavy Tank',
            'modern_tank_equipment':      'Modern Tank',
            'motorized_equipment':        'Motorized',
            'mechanized_equipment':       'Mechanized',
            'armored_car_equipment':      'Arm. Car',
            'rocket_artillery_equipment': 'Rocket Art.',
            'flame_tank_equipment':       'Flame Tank',
            'amphibious_tank_equipment':  'Amph. Tank',
            'horse_equipment':            'Horse',
            'camel_equipment':            'Camel',
        };
        return map[reqName] || reqName
            .replace(/_equipment$/, '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    getSavedTemplates() {
        return this._templates;
    }

    _setTemplates(obj) {
        this._templates = obj;
    }

    renderTemplateList() {
        const list = document.getElementById('tb-template-list');
        if (!list) return;
        const templates = this.getSavedTemplates();
        const names = Object.keys(templates);

        if (names.length === 0) {
            list.innerHTML = `<div style="color: #666; font-size: 12px; text-align: center; margin-top: 20px;">No saved templates.</div>`;
            return;
        }

        list.innerHTML = '';
        const tmplSource = document.getElementById('tmpl-card');

        names.forEach(name => {
            const card = document.createElement('div');
            card.className = 'hoi4-tmpl-card';
            card.dataset.name = name;
            card.draggable = true;

            if (this.currentTemplateName === name) {
                card.classList.add('active');
            }

            
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', name);
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => card.style.opacity = '0.5', 0);
            });
            card.addEventListener('dragend', () => card.style.opacity = '1');
            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const draggingItem = list.querySelector('.hoi4-tmpl-card[style*="opacity: 0.5"]');
                if (!draggingItem || draggingItem === card) return;

                const bounding = card.getBoundingClientRect();
                const offset = e.clientY - bounding.top;
                if (offset > bounding.height / 2) card.after(draggingItem);
                else card.before(draggingItem);
            });
            card.addEventListener('drop', (e) => {
                e.preventDefault();
                this.saveTemplateOrder();
            });

            
            if (tmplSource) {
                const clone = tmplSource.content.cloneNode(true);
                
                const nameEl = clone.querySelector('.tmpl-name');
                if (nameEl) {
                    nameEl.title = name;
                    nameEl.textContent = name;
                }

                const btnView = clone.querySelector('.btn-view');
                if (btnView) btnView.onclick = () => this.loadTemplate(name, { viewOnly: true });
                
                const btnEdit = clone.querySelector('.btn-edit');
                if (btnEdit) btnEdit.onclick = () => this.loadTemplate(name, { viewOnly: false });
                
                const btnDelete = clone.querySelector('.tmpl-delete');
                if (btnDelete) {
                    btnDelete.onclick = () => { 
                        if (confirm(`Delete "${name}"?`)) this.deleteTemplate(name); 
                    };
                }
                
                card.appendChild(clone);
            }

            list.appendChild(card);
        });
    }

    saveTemplateOrder() {
        const list = document.getElementById('tb-template-list');
        const newOrder = Array.from(list.querySelectorAll('.tb-tmpl-row')).map(row => row.dataset.name);
        const templates = this.getSavedTemplates();
        const reorderedTemplates = {};

        newOrder.forEach(name => {
            if (templates[name]) reorderedTemplates[name] = templates[name];
        });

        this._setTemplates(reorderedTemplates);
    }

    saveTemplate() {
        const nameInput = document.getElementById('hoi4-template-name');
        const name = nameInput.value.trim();
        const templates = this.getSavedTemplates();

        if (!name || !this.hasCombatBattalions() || (templates[name] && this.currentTemplateName !== name)) {
            return;
        }

        let templatesObj = this.getSavedTemplates();

        if (this.currentTemplateName && this.currentTemplateName !== name && templatesObj[this.currentTemplateName]) {
            const newTemplates = {};
            for (let key in templatesObj) {
                if (key === this.currentTemplateName) {
                    newTemplates[name] = { combatSlots: this.combatSlots.map(col => [...col]), supportSlots: [...this.supportSlots] };
                } else {
                    newTemplates[key] = templatesObj[key];
                }
            }
            templatesObj = newTemplates;
        } else {
            templatesObj[name] = { combatSlots: this.combatSlots.map(col => [...col]), supportSlots: [...this.supportSlots] };
        }

        this._setTemplates(templatesObj);
        this.currentTemplateName = name;
        this.renderTemplateList();
        this.updateButtonsUI();
    }

    loadTemplate(name, opts = {}) {
        const t = this.getSavedTemplates()[name];
        if (!t) return;

        this.combatSlots  = t.combatSlots.map(col => [...col]);
        this.supportSlots = [...t.supportSlots];
        this.currentTemplateName = name;
        this.viewMode = opts.viewOnly || false;

        const nameInput = document.getElementById('hoi4-template-name');
        if (nameInput) {
            nameInput.value    = name;
            nameInput.disabled = this.viewMode;
        }

        const badge = document.getElementById('view-mode-badge');
        if (badge) {
            if (this.viewMode) badge.classList.remove('hidden');
            else badge.classList.add('hidden');
        }

        this.renderGrid();
        this.updateStatsUI();
        this.renderTemplateList();
    }

    createNewTemplate() {
        this.viewMode = false;
        this.supportSlots = new Array(5).fill(null);
        this.combatSlots = Array.from({ length: 5 }, () => new Array(5).fill(null));
        this.currentTemplateName = null;

        const nameInput = document.getElementById('hoi4-template-name');
        if (nameInput) { nameInput.value = "New Division Template"; nameInput.disabled = false; }

        const badge = document.getElementById('view-mode-badge');
        if (badge) badge.classList.add('hidden');

        this.renderGrid();
        this.updateStatsUI();
    }

    duplicateTemplate() {
        const nameInput = document.getElementById('hoi4-template-name');
        if (!nameInput || !nameInput.value.trim()) return;

        
        nameInput.value    = nameInput.value.trim() + ' Copy';
        nameInput.disabled = false;
        this.currentTemplateName = null;
        this.viewMode = false;

        const badge = document.getElementById('view-mode-badge');
        if (badge) badge.classList.add('hidden');

        this.updateButtonsUI();
    }

    deleteTemplate(name) {
        const templates = this.getSavedTemplates();
        delete templates[name];
        this._setTemplates(templates);

        if (this.currentTemplateName === name) {
            this.currentTemplateName = null;
        }

        this.renderTemplateList();
    }

    initTemplateUI() {
        const saveBtn = document.getElementById('tb-template-save');
        const newBtn = document.getElementById('tb-template-new');
        const dupBtn = document.getElementById('tb-template-duplicate');
        const resetBtn = document.getElementById('tb-template-reset');
        const nameInput = document.getElementById('hoi4-template-name');
        const tooltip = document.getElementById('tooltip');

        if (saveBtn) {
            saveBtn.onclick = () => { if (!saveBtn.disabled) this.saveTemplate(); };

            saveBtn.addEventListener('mousemove', (e) => {
                if (saveBtn.disabled && saveBtn.dataset.error) {
                    tooltip.innerHTML = `<span style="color: #ff3333; font-weight: bold;">${saveBtn.dataset.error}</span>`;
                    tooltip.style.display = 'block';

                    const tooltipRect = tooltip.getBoundingClientRect();
                    let left = e.pageX + 15;
                    let top = e.pageY + 15;
                    if (e.clientX + 15 + tooltipRect.width > window.innerWidth) left = e.pageX - tooltipRect.width - 15;
                    if (e.clientY + 15 + tooltipRect.height > window.innerHeight) top = e.pageY - tooltipRect.height - 15;

                    tooltip.style.left = left + 'px';
                    tooltip.style.top = top + 'px';
                }
            });

            saveBtn.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
        }

        if (newBtn) newBtn.onclick = () => this.createNewTemplate();
        if (dupBtn) dupBtn.onclick = () => this.duplicateTemplate();
        
        
        if (resetBtn) {
            resetBtn.onclick = () => {
                if (!this.hasUnsavedChanges()) return; 
                
                if (this.currentTemplateName && this.getSavedTemplates()[this.currentTemplateName]) {
                    if (confirm('Revert all unsaved changes to this template?')) {
                        this.loadTemplate(this.currentTemplateName); 
                    }
                } else {
                    if (confirm('Clear all unsaved changes?')) {
                        this.createNewTemplate(); 
                    }
                }
            };
        }

        if (nameInput) {
            nameInput.addEventListener('input', () => this.updateButtonsUI());

            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (saveBtn && !saveBtn.disabled) this.saveTemplate();
                    e.target.blur();
                }
            });
        }

        this.renderTemplateList();
    }
}
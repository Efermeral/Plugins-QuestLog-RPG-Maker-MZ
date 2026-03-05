/*:
 * @target MZ
 * @plugindesc Quest Log v1.5 - Story/Side + Active/Completed + Item/Kill objectives + minimal UI
 *
 * @help
 * API:
 * $gameParty.addQuest(id, name, description, type, objectives, options);
 *   - objectives: array of objects:
 *       { type:"item", id: ITEM_ID, required: N }
 *       { type:"kill",  enemyId: ENEMY_ID, required: N }
 *   - options: { autoComplete: true/false } (optional)
 *
 * $gameParty.completeQuest(id);
 * $gameParty.reactivateQuest(id);
 * $gameParty.getQuestProgress(id); // returns array of {type,id/ enemyId, required, current}
 *
 * Example:
 * $gameParty.addQuest(2, "Kumpulkan Batu", "Ambil 3 batu api dari hutan.", "side",
 *   [{type:"item", id:5, required:3}, {type:"kill", enemyId:8, required:2}],
 *   { autoComplete: true }
 * );
 *
 * Supports auto-incrementing kill counters when enemies die in battle.
 */

(() => {

  // -------------------------
  // Quest class
  // -------------------------
  class Quest {
    constructor(id, name, description, type, objectives, options) {
      this.id = id;
      this.name = name;
      this.description = description;
      this.type = type || "side";
      this.completed = false;
      this.options = options || {};
      // Normalize objectives: ensure `current` field for kill/objective types
      this.objectives = (objectives || []).map(obj => {
        const copy = Object.assign({}, obj);
        if (copy.type === "kill") {
          copy.current = copy.current || 0;
        }
        return copy;
      });
    }
  }

  // -------------------------
  // Extend Game_Party
  // -------------------------
  const _Game_Party_initialize = Game_Party.prototype.initialize;
  Game_Party.prototype.initialize = function () {
    _Game_Party_initialize.call(this);
    this._quests = [];
  };

  /**
   * addQuest(id, name, description, type, objectives, options)
   * - objectives: optional array
   * - options: optional object { autoComplete: boolean }
   * Behavior:
   * - if quest not exist -> push new Quest
   * - if quest exists -> update fields; if was completed -> set completed=false (reactivate)
   */
  Game_Party.prototype.addQuest = function (id, name, description, type, objectives, options) {
    const quest = this._quests.find(q => q.id === id);
    if (!quest) {
      this._quests.push(new Quest(id, name, description, type, objectives, options));
    } else {
      // update basic fields if provided
      quest.name = name || quest.name;
      quest.description = description || quest.description;
      quest.type = type || quest.type;
      if (objectives) {
        // merge/replace objectives - reset kill progress to 0 for new objectives
        quest.objectives = objectives.map(obj => {
          const copy = Object.assign({}, obj);
          if (copy.type === "kill") copy.current = copy.current || 0;
          return copy;
        });
      }
      if (options) quest.options = Object.assign({}, quest.options, options);
      // Reactivate if previously completed
      if (quest.completed) quest.completed = false;
    }
  };

  Game_Party.prototype.completeQuest = function (id) {
    const quest = this._quests.find(q => q.id === id);
    if (quest) quest.completed = true;
  };

  Game_Party.prototype.reactivateQuest = function (id) {
    const quest = this._quests.find(q => q.id === id);
    if (quest) quest.completed = false;
  };

  Game_Party.prototype.getQuestsByTypeAndStatus = function (type, completed) {
    return this._quests.filter(q => q.type === type && q.completed === completed);
  };

  /**
   * getQuestProgress(questId)
   * Return array of progress objects: { type, id/enemyId, required, current }
   */
  Game_Party.prototype.getQuestProgress = function (questId) {
    const quest = this._quests.find(q => q.id === questId);
    if (!quest) return null;
    return quest.objectives.map(obj => {
      if (obj.type === "item") {
        const item = $dataItems[obj.id] || null;
        const current = item ? $gameParty.numItems(item) : 0;
        return { type: "item", id: obj.id, required: obj.required, current: current, name: item ? item.name : `Item ${obj.id}` };
      } else if (obj.type === "kill") {
        const enemy = $dataEnemies[obj.enemyId] || null;
        const current = obj.current || 0;
        return { type: "kill", enemyId: obj.enemyId, required: obj.required, current: current, name: enemy ? enemy.name : `Enemy ${obj.enemyId}` };
      } else {
        return Object.assign({}, obj, { current: obj.current || 0 });
      }
    });
  };

  /**
   * Internal helper: check if a quest has all objectives satisfied
   */
  Game_Party.prototype._isQuestFulfilled = function (quest) {
    if (!quest || !quest.objectives || quest.objectives.length === 0) return false;
    return quest.objectives.every(obj => {
      if (obj.type === "item") {
        const item = $dataItems[obj.id] || null;
        const current = item ? $gameParty.numItems(item) : 0;
        return current >= obj.required;
      } else if (obj.type === "kill") {
        return (obj.current || 0) >= obj.required;
      }
      return false;
    });
  };

  // -------------------------
  // Hook enemy death to increase kill counters
  // -------------------------
  const _Game_Enemy_die = Game_Enemy.prototype.die;
  Game_Enemy.prototype.die = function () {
    // call original behavior first
    _Game_Enemy_die && _Game_Enemy_die.call(this);

    try {
      // enemyId (database id)
      const eid = this.enemyId();
      // iterate party quests and update kill objectives that match this enemy id
      ($gameParty._quests || []).forEach(quest => {
        let changed = false;
        if (!quest.objectives) return;
        quest.objectives.forEach(obj => {
          if (obj.type === "kill" && obj.enemyId === eid) {
            obj.current = (obj.current || 0) + 1;
            changed = true;
          }
        });
        // if autoComplete option set AND now fulfilled -> complete
        if (changed && quest.options && quest.options.autoComplete) {
          if ($gameParty._isQuestFulfilled(quest)) {
            quest.completed = true;
            // optional: you could show a message, or set switches here
          }
        }
      });
    } catch (e) {
      // silent fail to avoid breaking battle if anything unexpected
      console.error("QuestLog plugin: error updating kill objectives:", e);
    }
  };

  // -------------------------
  // Menu integration (minimal UI)
  // -------------------------
  const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
  Window_MenuCommand.prototype.addOriginalCommands = function () {
    _Window_MenuCommand_addOriginalCommands.call(this);
    this.addCommand("Quest Log", "questLog", true);
  };

  const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
  Scene_Menu.prototype.createCommandWindow = function () {
    _Scene_Menu_createCommandWindow.call(this);
    this._commandWindow.setHandler("questLog", this.commandQuestLog.bind(this));
  };

  Scene_Menu.prototype.commandQuestLog = function () {
    SceneManager.push(Scene_QuestLog);
  };

  // -------------------------
  // Scene_QuestLog (minimalist layout)
  // -------------------------
  class Scene_QuestLog extends Scene_MenuBase {
    create() {
      super.create();
      this._type = "story";
      this._completed = false;
      this.createHelpWindow();
      this.createCategoryWindow();
      this.createStatusWindow();
      this.createQuestListWindow();

      // focus first control
      this._categoryWindow.activate();
      this._categoryWindow.select(0);

      // navigation handlers
      this._questListWindow.setHandler("cancel", () => {
        this._questListWindow.deactivate();
        this._statusWindow.activate();
        this._statusWindow.select(0);
      });

      this._statusWindow.setHandler("active", () => {
        this.switchStatus(false);
        this._statusWindow.deactivate();
        this._questListWindow.activate();
        this._questListWindow.select(0);
      });

      this._statusWindow.setHandler("completed", () => {
        this.switchStatus(true);
        this._statusWindow.deactivate();
        this._questListWindow.activate();
        this._questListWindow.select(0);
      });

      this._statusWindow.setHandler("cancel", () => {
        this._statusWindow.deactivate();
        this._categoryWindow.activate();
        this._categoryWindow.select(0);
      });

      this._categoryWindow.setHandler("story", () => {
        this.switchCategory("story");
        this._categoryWindow.deactivate();
        this._statusWindow.activate();
        this._statusWindow.select(0);
      });

      this._categoryWindow.setHandler("side", () => {
        this.switchCategory("side");
        this._categoryWindow.deactivate();
        this._statusWindow.activate();
        this._statusWindow.select(0);
      });

      this._categoryWindow.setHandler("cancel", this.popScene.bind(this));
    }

    helpWindowRect() {
      return new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(2, false));
    }

    createCategoryWindow() {
      const y = this._helpWindow.height;
      const rect = new Rectangle(0, y, Math.floor(Graphics.boxWidth * 0.5), this.calcWindowHeight(1, false));
      this._categoryWindow = new Window_QuestCategory(rect);
      this.addWindow(this._categoryWindow);
    }

    createStatusWindow() {
      const y = this._helpWindow.height;
      const x = Math.floor(Graphics.boxWidth * 0.5);
      const rect = new Rectangle(x, y, Graphics.boxWidth - x, this.calcWindowHeight(1, false));
      this._statusWindow = new Window_QuestStatus(rect);
      this.addWindow(this._statusWindow);
    }

    createQuestListWindow() {
      const y = this._helpWindow.height + this._categoryWindow.height;
      const h = Graphics.boxHeight - y;
      const rect = new Rectangle(0, y, Graphics.boxWidth, h);
      this._questListWindow = new Window_QuestList(rect, this._type, this._completed);
      this._questListWindow.setHelpWindow(this._helpWindow);
      this.addWindow(this._questListWindow);
    }

    switchCategory(type) {
      this._type = type;
      this._questListWindow.setTypeAndStatus(type, this._completed);
    }

    switchStatus(completed) {
      this._completed = completed;
      this._questListWindow.setTypeAndStatus(this._type, completed);
    }
  }

  // -------------------------
  // Minimal windows
  // -------------------------
  class Window_QuestCategory extends Window_HorzCommand {
    maxCols() { return 2; }
    makeCommandList() {
      this.addCommand("Story", "story");
      this.addCommand("Side", "side");
    }
  }

  class Window_QuestStatus extends Window_HorzCommand {
    maxCols() { return 2; }
    makeCommandList() {
      this.addCommand("Active", "active");
      this.addCommand("Completed", "completed");
    }
  }

  /**
   * Window_QuestList: minimal and clean
   * - shows name and short progress (first objective) on one line
   * - help window shows description + full objective list with progress
   */
  class Window_QuestList extends Window_Selectable {
    constructor(rect, type, completed) {
      super(rect);
      this._type = type;
      this._completed = completed;
      this._refreshCounter = 0;
      this.refresh();
    }

    setTypeAndStatus(type, completed) {
      this._type = type;
      this._completed = completed;
      this.refresh();
    }

    maxItems() {
      return this._data ? this._data.length : 0;
    }

    refresh() {
      this._data = $gameParty.getQuestsByTypeAndStatus(this._type, this._completed);
      this.createContents();
      this.drawAllItems();
    }

    drawItem(index) {
      const quest = this._data[index];
      if (quest) {
        const rect = this.itemLineRect(index);
        // Compose minimal name + short progress
        let short = "";
        if (quest.objectives && quest.objectives.length > 0) {
          const o = quest.objectives[0];
          if (o.type === "item") {
            const current = $gameParty.numItems($dataItems[o.id] || null) || 0;
            short = ` (${current}/${o.required})`;
          } else if (o.type === "kill") {
            const current = o.current || 0;
            short = ` (${current}/${o.required})`;
          }
        }
        const text = `${quest.name}${short}`;
        // minimal styling: use system color for completed
        if (quest.completed) {
          this.changeTextColor(ColorManager.systemColor());
          this.drawText(text, rect.x, rect.y, rect.width, "left");
          this.resetTextColor();
        } else {
          this.drawText(text, rect.x, rect.y, rect.width, "left");
        }
      }
    }

    currentQuest() {
      return this._data[this.index()];
    }

    updateHelp() {
      const quest = this.currentQuest();
      if (!quest) {
        this._helpWindow.setText("");
        return;
      }
      // description + objectives lines
      let lines = quest.description ? String(quest.description) : "";
      if (quest.objectives && quest.objectives.length > 0) {
        lines += "\n\nObjectives:";
        quest.objectives.forEach(obj => {
          if (obj.type === "item") {
            const item = $dataItems[obj.id] || null;
            const current = item ? $gameParty.numItems(item) : 0;
            const name = item ? item.name : `Item ${obj.id}`;
            lines += `\n• ${name}: ${current}/${obj.required}`;
          } else if (obj.type === "kill") {
            const enemy = $dataEnemies[obj.enemyId] || null;
            const current = obj.current || 0;
            const name = enemy ? enemy.name : `Enemy ${obj.enemyId}`;
            lines += `\n• ${name}: ${current}/${obj.required}`;
          } else {
            lines += `\n• ${obj.type}: ${obj.current || 0}/${obj.required || "?"}`;
          }
        });
      }
      this._helpWindow.setText(lines);
    }

    update() {
      super.update();
      // periodically refresh to show updated item/kill progress without user action
      this._refreshCounter = (this._refreshCounter + 1) % 30; // ~0.5s at 60fps
      if (this._refreshCounter === 0) {
        if (this._data && this._data.length > 0) {
          this.refresh();
        }
      }
    }
  }

})();

/*:
 * @target MZ
 * @plugindesc Quest Log minimalis (Story/Side, Back button, kill fix, report completion) v1.3 @author kun
 * 
 * @help
 * Tambahkan quest:
 * $gameParty.addQuest(id, name, desc, type, objectives, options, reactivate);
 * 
 * Contoh quest kill:
 * $gameParty.addQuest(2, "Bunuh 3 Goblin", "Hancurkan goblin di hutan.", "side",
 *   [{type:"kill", enemyId:3, required:3}], {autoComplete:false});
 * 
 * Di event NPC: 
 * If Script: $gameParty.isQuestFulfilled(2)
 *   Script: $gameParty.completeQuest(2)
 * 
 */

(() => {
  class Quest {
    constructor(id, name, desc, type, objectives, options) {
      this.id = id;
      this.name = name;
      this.desc = desc;
      this.type = type || "side";
      this.completed = false;
      this.options = options || {};
      this.objectives = (objectives || []).map(o => {
        const copy = {...o};
        if (copy.type === "kill") copy.current = copy.current || 0;
        return copy;
      });
    }
  }

  // ===== Game Party =====
  const _Game_Party_initialize = Game_Party.prototype.initialize;
  Game_Party.prototype.initialize = function() {
    _Game_Party_initialize.call(this);
    this._quests = [];
  };

  Game_Party.prototype.addQuest = function(id, name, desc, type, objectives, options, reactivate = false) {
    const q = this._quests.find(q => q.id === id);
    if (!q) {
      this._quests.push(new Quest(id, name, desc, type, objectives, options));
    } else if (reactivate && q.completed) {
      q.completed = false;
      if (objectives) q.objectives = objectives;
    }
  };

  Game_Party.prototype.completeQuest = function(id) {
    const q = this._quests.find(q => q.id === id);
    if (q) q.completed = true;
  };

  Game_Party.prototype.isQuestFulfilled = function(id) {
    const q = this._quests.find(q => q.id === id);
    if (!q) return false;
    return q.objectives.every(o => {
      if (o.type === "kill") return o.current >= o.required;
      if (o.type === "item") return $gameParty.numItems($dataItems[o.id]) >= o.required;
      return false;
    });
  };

  Game_Party.prototype.getQuestsByType = function(type) {
    return this._quests.filter(q => q.type === type);
  };

  // ===== Kill Progress Auto Update (Fix: prevent double count) =====
  const _Enemy_die = Game_Enemy.prototype.die;
  Game_Enemy.prototype.die = function() {
    if (this._alreadyCounted) return; // prevent double count
    this._alreadyCounted = true;

    _Enemy_die.call(this);
    const eid = this.enemyId();

    ($gameParty._quests || []).forEach(q => {
      q.objectives?.forEach(o => {
        if (o.type === "kill" && o.enemyId === eid && !q.completed) {
          o.current = (o.current || 0) + 1;
        }
      });

      if (q.options?.autoComplete && $gameParty.isQuestFulfilled(q.id)) {
        q.completed = true;
      }
    });
  };

  // ===== Menu Command =====
  const _addCommands = Window_MenuCommand.prototype.addOriginalCommands;
  Window_MenuCommand.prototype.addOriginalCommands = function() {
    _addCommands.call(this);
    this.addCommand("Quests", "questLog", true);
  };

  const _createCommand = Scene_Menu.prototype.createCommandWindow;
  Scene_Menu.prototype.createCommandWindow = function() {
    _createCommand.call(this);
    this._commandWindow.setHandler("questLog", () => SceneManager.push(Scene_QuestBoard));
  };

  // ===== Scene QuestBoard =====
  class Scene_QuestBoard extends Scene_MenuBase {
    create() {
      super.create();
      this.createQuestWindow();
      this.createCancelButton();
    }

    createQuestWindow() {
      const rect = new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight);
      this._questWindow = new Window_QuestBoard(rect);
      this.addWindow(this._questWindow);
    }

    createCancelButton() {
      this._cancelButton = new Sprite_Button("cancel");
      this._cancelButton.x = Graphics.boxWidth - this._cancelButton.width - 10;
      this._cancelButton.y = 10;
      this._cancelButton.setClickHandler(() => {
        SoundManager.playCancel();
        SceneManager.pop();
      });
      this.addChild(this._cancelButton);
    }

    update() {
      super.update();
      if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
        SoundManager.playCancel();
        SceneManager.pop();
      }
    }
  }

  // ===== Window QuestBoard =====
  class Window_QuestBoard extends Window_Base {
    initialize(rect) {
      super.initialize(rect);
      this.opacity = 180;
      this.refresh();
    }

    refresh() {
      this.contents.clear();
      let y = 0;
      const lh = this.lineHeight();

      this.changeTextColor(ColorManager.systemColor());
      this.drawText("Quests", 0, y, this.contents.width, "left");
      y += lh + 10;
      this.resetTextColor();

      // STORY
      this.drawSection("Story Quests", $gameParty.getQuestsByType("story"), y);
      y += lh * ($gameParty.getQuestsByType("story").length + 2);

      // SIDE
      this.drawSection("Side Quests", $gameParty.getQuestsByType("side"), y);
    }

    drawSection(title, list, y) {
      const lh = this.lineHeight();
      this.changeTextColor(ColorManager.systemColor());
      this.drawText(title, 0, y, this.contents.width, "left");
      this.resetTextColor();
      y += lh;

      if (list.length === 0) {
        this.changeTextColor(ColorManager.textColor(8));
        this.drawText("Tidak ada quest aktif.", 20, y, this.contents.width, "left");
        this.resetTextColor();
      } else {
        list.forEach(q => {
          this.drawQuest(q, y);
          y += lh;
        });
      }
    }

    drawQuest(q, y) {
      const rectW = this.contents.width;
      const text = q.name;
      let progress = "";

      if (q.completed) progress = "(Complete)";
      else if (q.objectives[0]) {
        const o = q.objectives[0];
        const current = o.type === "item"
          ? $gameParty.numItems($dataItems[o.id])
          : (o.current || 0);
        progress = `(${current}/${o.required})`;
      }

      this.drawText(text, 20, y, rectW - 100, "left");
      this.drawText(progress, 0, y, rectW - 20, "right");
    }

    update() {
      super.update();
      if (Graphics.frameCount % 30 === 0) this.refresh();
    }
  }
})();

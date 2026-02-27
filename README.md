# Plugins-QuestLog-RPG-Maker-MZ


QuestLog.js is a plugin/helper for RPG Maker MZ that implements a lightweight, minimal quest system within the player’s party. It enables adding, updating, completing, and tracking progress of quests based on item collection and enemy defeats. A minimal UI is included to display the quest list and their statuses.

Key Features

Quest model

Quest class with properties: id, name, description, type (default "side"), completed, objectives, options.
Objectives support two types: item and kill. Kill objectives track progress via a current field.
Normalizes input objectives so that kill-type objectives have a current value by default.
Quest management on Game_Party

Init a this._quests store for the party’s quests.
addQuest(id, name, description, type, objectives, options)
Adds a new quest if it doesn’t exist.
If the quest already exists, updates provided fields; merges objectives (resets kill progress to 0 if present).
Auto-reactivates a quest if it was previously completed and re-added.
completeQuest(id) and reactivateQuest(id)
Mark a quest as completed or active.
getQuestsByTypeAndStatus(type, completed)
Retrieve quests filtered by type (story/side) and status (active/completed).
getQuestProgress(questId)
Returns progress for each objective of a given quest, with the objective’s name when available.
_isQuestFulfilled(quest)
Internal check to determine if all objectives are satisfied.
Progress tracking during battles

Hook into Game_Enemy.prototype.die to increment relevant kill counters when a matching enemy is defeated.
If a quest has autoComplete enabled and all objectives are fulfilled, the quest is automatically marked as completed.
Minimal Quest Log UI (in-game menu)

Added “Quest Log” to the main menu.
Scene_QuestLog (minimal layout)
Help window shows the quest description and objective list.
Window_QuestCategory (Story/Side) for type filtering.
Window_QuestStatus (Active/Completed) for status filtering.
Window_QuestList
Displays quest names and a brief progress summary (progress on the first objective, items or kills).
Completed quests render text with a system color.
Window_QuestList.updateHelp() shows full quest details, including per-objective progress (item counts, kill current/required).
Interaction details

Simple navigation between categories, status, and quest list.
Help window presents summaries and objective progress details.
Auto-refresh of progress when item/kill changes (roughly every ~0.5 seconds).
Compatibility and fallbacks

Designed to avoid crashes if item/enemy data is missing (fallback names like “Item {id}” or “Enemy {id}” are used).
Limited error handling with console.error if updating a kill objective fails, to minimize disruption during battles.
Code structure highlights

Quest class and objective normalization
Patching Game_Party to extend behavior (adding quests, updating progress, etc.)
Hook into Game_Enemy.die for kill progress
Scene_QuestLog with modular windows:
Window_QuestCategory
Window_QuestStatus
Window_QuestList
Help window integrated
Potential enhancements / guidelines

Per-quest autoComplete option to mark complete once all objectives are fulfilled.
Align kill progression with other battle systems via additional events/triggers.
UI refinements: icons, colors, or more detailed progress bars.
Example API usage (based on the header in the code)

Add a new quest:
$gameParty.addQuest(2, "Gather Stones", "Collect 3 lava stones from the forest.", "side",
[{type:"item", id:5, required:3}, {type:"kill", enemyId:8, required:2}],
{ autoComplete: true }
);
Mark a quest as completed:
$gameParty.completeQuest(2);
Reactivate a completed quest:
$gameParty.reactivateQuest(2);
Get quest progress:
$gameParty.getQuestProgress(2);

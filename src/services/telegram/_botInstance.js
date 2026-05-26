// Shared accessor for the main bot instance so handlers can send messages
// without importing the full BotManager (which would cause circular imports).
let _mainBot = null;

module.exports = {
    set(bot) { _mainBot = bot; },
    get() { return _mainBot; }
};

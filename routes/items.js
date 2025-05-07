const express = require('express');
const router = express.Router();

// Создаем массив из 1,000,000 элементов
let fullList = Array.from({ length: 1000000 }, (_, i) => ({
    id: i + 1,
    value: `Элемент ${i + 1}`,
    position: i + 1,
}));

// Состояние приложения
let state = {
    selectedIds: [],
    customOrder: []
};

// GET /items?search=...&offset=...&limit=...
router.get('/', (req, res) => {
    const { search = '', offset = 0, limit = 20, customOrder = '' } = req.query;
    const numOffset = parseInt(offset, 10);
    const numLimit = parseInt(limit, 10);

    const orderArray = customOrder
        ? customOrder.split(',').map(id => parseInt(id, 10))
        : state.customOrder;

    let filteredList = [...fullList];

    // Применяем пользовательский порядок
    if (orderArray.length > 0) {
        const positionMap = new Map();
        orderArray.forEach((id, index) => {
            positionMap.set(id, index);
        });

        filteredList.sort((a, b) => {
            const posA = positionMap.has(a.id) ? positionMap.get(a.id) : a.position;
            const posB = positionMap.has(b.id) ? positionMap.get(b.id) : b.position;
            return posA - posB;
        });
    }

    // Поиск
    if (search) {
        filteredList = filteredList.filter(item =>
            item.value.toLowerCase().includes(search.toLowerCase())
        );
    }

    const totalCount = filteredList.length;
    const pagedItems = filteredList.slice(numOffset, numOffset + numLimit);

    const itemsWithSelection = pagedItems.map(item => ({
        ...item,
        selected: state.selectedIds.includes(item.id)
    }));

    res.json({
        items: itemsWithSelection,
        hasMore: numOffset + numLimit < totalCount,
        total: totalCount
    });
});

// POST /save-state
router.post('/save-state', (req, res) => {
    const { selectedIds = [], customOrder = [] } = req.body;

    state.selectedIds = selectedIds;

    if (customOrder && customOrder.length > 0) {
        state.customOrder = customOrder;
    }

    res.sendStatus(200);
});

// GET /get-state
router.get('/get-state', (req, res) => {
    res.json({
        selectedIds: state.selectedIds,
        customOrder: state.customOrder
    });
});

module.exports = router;
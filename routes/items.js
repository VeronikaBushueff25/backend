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
    const { search = '', offset = 0, limit = 20, useStoredOrder = 'true' } = req.query;
    const numOffset = parseInt(offset, 10);
    const numLimit = parseInt(limit, 10);
    const shouldUseStoredOrder = useStoredOrder === 'true';

    let filteredList = [...fullList];

    // Применяем пользовательский порядок, если он существует и запрошен
    if (shouldUseStoredOrder && state.customOrder.length > 0) {
        const positionMap = new Map();
        const uniqueOrder = [...new Set(state.customOrder)];

        uniqueOrder.forEach((id, index) => {
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

    const uniqueItemIds = new Set();
    const uniqueItems = pagedItems.filter(item => {
        if (uniqueItemIds.has(item.id)) {
            return false;
        }
        uniqueItemIds.add(item.id);
        return true;
    });

    const itemsWithSelection = uniqueItems.map(item => ({
        ...item,
        selected: state.selectedIds.includes(item.id)
    }));

    res.json({
        items: itemsWithSelection,
        hasMore: numOffset + numLimit < totalCount,
        total: totalCount
    });
});

// ЭНДПОИНТ: Получение всех ID элементов (с пагинацией)
router.get('/ids', (req, res) => {
    const { chunk = 0, size = 5000 } = req.query;
    const chunkIndex = parseInt(chunk, 10);
    const chunkSize = parseInt(size, 10);

    const safeChunkSize = Math.min(chunkSize, 10000);

    let orderedIds;

    if (state.customOrder && state.customOrder.length > 0) {
        const uniqueCustomOrder = [...new Set(state.customOrder)];

        const customOrderSet = new Set(uniqueCustomOrder);

        const remainingIds = fullList
            .map(item => item.id)
            .filter(id => !customOrderSet.has(id));

        orderedIds = [...uniqueCustomOrder, ...remainingIds];
    } else {
        orderedIds = fullList.map(item => item.id);
    }

    const totalChunks = Math.ceil(orderedIds.length / safeChunkSize);

    const startIndex = chunkIndex * safeChunkSize;
    const endIndex = Math.min(startIndex + safeChunkSize, orderedIds.length);
    const idsChunk = orderedIds.slice(startIndex, endIndex);

    res.json({
        ids: idsChunk,
        chunk: chunkIndex,
        totalChunks: totalChunks,
        total: orderedIds.length
    });
});

// POST /save-state
router.post('/save-state', (req, res) => {
    const { selectedIds = [], customOrder = [], orderChanges = null } = req.body;

    state.selectedIds = [...new Set(selectedIds)];

    if (customOrder && customOrder.length > 0) {
        state.customOrder = [...new Set(customOrder)];
    }
    else if (orderChanges) {
        const { itemId, oldIndex, newIndex } = orderChanges;

        if (state.customOrder.length === 0) {
            state.customOrder = [...new Set(fullList.map(item => item.id))];
        } else {
            state.customOrder = [...new Set(state.customOrder)];
        }

        // Выполняем изменение порядка
        if (oldIndex !== newIndex && itemId) {
            state.customOrder = state.customOrder.filter(id => id !== itemId);

            if (newIndex >= 0 && newIndex <= state.customOrder.length) {
                state.customOrder.splice(newIndex, 0, itemId);
            } else {
                state.customOrder.push(itemId);
            }
        }
    }

    res.sendStatus(200);
});

// GET /get-state
router.get('/get-state', (req, res) => {
    const uniqueSelectedIds = [...new Set(state.selectedIds)];
    const uniqueCustomOrder = [...new Set(state.customOrder)];

    res.json({
        selectedIds: uniqueSelectedIds,
        customOrderLength: uniqueCustomOrder.length
    });
});

// ЭНДПОИНТ: Получение фрагмента пользовательского порядка
router.get('/custom-order', (req, res) => {
    const { start = 0, count = 1000 } = req.query;
    const startIndex = parseInt(start, 10);
    const itemCount = Math.min(parseInt(count, 10), 5000);
    const uniqueCustomOrder = [...new Set(state.customOrder)];

    const orderSlice = uniqueCustomOrder.slice(startIndex, startIndex + itemCount);

    res.json({
        orderSlice,
        start: startIndex,
        total: uniqueCustomOrder.length
    });
});

module.exports = router;
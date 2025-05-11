const express = require('express');
const router = express.Router();

// Создаем массив из 1,000,000 элементов
let fullList = Array.from({ length: 1000000 }, (_, i) => ({
    id: i + 1,
    value: `Элемент ${i + 1}`,
    position: i + 1,
    numericValue: i + 1
}));

// Состояние приложения
let state = {
    selectedIds: [],
    customOrder: [],
    searchFilters: {}
};

router.get('/', (req, res) => {
    const { search = '', offset = 0, limit = 20, useStoredOrder = 'true' } = req.query;
    const numOffset = parseInt(offset, 10);
    const numLimit = parseInt(limit, 10);
    const searchKey = search.toLowerCase();

    let filteredList = [...fullList];
    if (search) {
        filteredList = filteredList.filter(item =>
            item.value.toLowerCase().includes(searchKey)
        );
    }

    // Сортировка по умолчанию
    filteredList.sort((a, b) => a.numericValue - b.numericValue);

    // Нарезаем текущую страницу
    let pagedItems = filteredList.slice(numOffset, numOffset + numLimit);

    // Применяем сохранённый порядок только к текущей странице
    if (useStoredOrder === 'true' && search && state.searchFilters[searchKey]) {
        const changes = state.searchFilters[searchKey];

        const applyChange = (arr, { itemId, newIndex }) => {
            const currentIndex = arr.findIndex(x => x.id === itemId);
            if (currentIndex === -1) return;
            const [el] = arr.splice(currentIndex, 1);
            const ni = Math.max(0, Math.min(newIndex, arr.length));
            arr.splice(ni, 0, el);
        };

        for (const change of changes) {
            applyChange(pagedItems, change);
        }
    }

    const itemsWithSelection = pagedItems.map(item => ({
        ...item,
        selected: state.selectedIds.includes(item.id)
    }));

    res.json({
        items: itemsWithSelection,
        hasMore: numOffset + numLimit < filteredList.length,
        total: filteredList.length,
        search: search
    });
});

const express = require('express');
const router = express.Router();

// Создаем массив из 1 000 000 элементов
let fullList = Array.from({ length: 1000000 }, (_, i) => ({
    id: i + 1,
    value: `Элемент ${i + 1}`,
    position: i + 1,
    numericValue: i + 1
}));

// Состояние приложения
let state = {
    selectedIds: [],
    customOrder: [],
    searchFilters: {} // теперь храним не массив id, а массив изменений: [{ itemId, oldIndex, newIndex }]
};

// GET /items
router.get('/', (req, res) => {
    const { search = '', offset = 0, limit = 20, useStoredOrder = 'true' } = req.query;
    const numOffset = parseInt(offset, 10);
    const numLimit = parseInt(limit, 10);
    const searchKey = search.toLowerCase();

    let filteredList = [...fullList];
    if (search) {
        filteredList = filteredList.filter(item =>
            item.value.toLowerCase().includes(searchKey)
        );
    }

    // Сортировка по умолчанию
    filteredList.sort((a, b) => a.numericValue - b.numericValue);

    // Нарезаем текущую страницу
    let pagedItems = filteredList.slice(numOffset, numOffset + numLimit);

    // Применяем сохранённый порядок только к текущей странице
    if (useStoredOrder === 'true' && search && state.searchFilters[searchKey]) {
        const changes = state.searchFilters[searchKey];

        const applyChange = (arr, { itemId, newIndex }) => {
            const currentIndex = arr.findIndex(x => x.id === itemId);
            if (currentIndex === -1) return;
            const [el] = arr.splice(currentIndex, 1);
            const ni = Math.max(0, Math.min(newIndex, arr.length));
            arr.splice(ni, 0, el);
        };

        for (const change of changes) {
            applyChange(pagedItems, change);
        }
    }

    const itemsWithSelection = pagedItems.map(item => ({
        ...item,
        selected: state.selectedIds.includes(item.id)
    }));

    res.json({
        items: itemsWithSelection,
        hasMore: numOffset + numLimit < filteredList.length,
        total: filteredList.length,
        search: search
    });
});

// POST /save-state
router.post('/save-state', (req, res) => {
    const { selectedIds = [], customOrder = [], orderChanges = null, search = '' } = req.body;
    const searchKey = search.toLowerCase();

    state.selectedIds = [...new Set(selectedIds)];

    if (orderChanges && search) {
        if (!state.searchFilters[searchKey]) {
            state.searchFilters[searchKey] = [];
        }

        state.searchFilters[searchKey].push({
            itemId: orderChanges.itemId,
            oldIndex: orderChanges.oldIndex,
            newIndex: orderChanges.newIndex
        });
    } else if (!search && customOrder && customOrder.length > 0) {
        state.customOrder = [...new Set(customOrder)];
    }

    res.sendStatus(200);
});

// GET /get-state
router.get('/get-state', (req, res) => {
    res.json({
        selectedIds: [...new Set(state.selectedIds)],
        customOrderLength: state.customOrder.length,
        searchFiltersCount: Object.keys(state.searchFilters).length
    });
});

// GET /ids — получить все ID (порядок только общий)
router.get('/ids', (req, res) => {
    const { chunk = 0, size = 5000 } = req.query;
    const chunkIndex = parseInt(chunk, 10);
    const chunkSize = Math.min(parseInt(size, 10), 10000);

    let orderedIds;
    if (state.customOrder.length > 0) {
        const customSet = new Set(state.customOrder);
        const remaining = fullList.map(x => x.id).filter(id => !customSet.has(id));
        orderedIds = [...state.customOrder, ...remaining];
    } else {
        orderedIds = fullList.map(x => x.id);
    }

    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, orderedIds.length);

    res.json({
        ids: orderedIds.slice(start, end),
        chunk: chunkIndex,
        totalChunks: Math.ceil(orderedIds.length / chunkSize),
        total: orderedIds.length
    });
});

// GET /custom-order — не используется при новом подходе, но можно оставить
router.get('/custom-order', (req, res) => {
    const { start = 0, count = 1000, search = '' } = req.query;
    const searchKey = search.toLowerCase();
    const startIndex = parseInt(start, 10);
    const itemCount = Math.min(parseInt(count, 10), 5000);

    let orderToUse = [];
    if (search && state.searchFilters[searchKey]) {
        orderToUse = state.searchFilters[searchKey].map(change => change.itemId);
    } else {
        orderToUse = state.customOrder;
    }

    const orderSlice = orderToUse.slice(startIndex, startIndex + itemCount);

    res.json({
        orderSlice,
        start: startIndex,
        total: orderToUse.length,
        search: search
    });
});

module.exports = router;

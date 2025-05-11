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
    const shouldUseStoredOrder = useStoredOrder === 'true';
    const searchKey = search.toLowerCase();

    let filteredList = [...fullList];
    if (search) {
        filteredList = filteredList.filter(item =>
            item.value.toLowerCase().includes(searchKey)
        );

        // Правильная числовая сортировка для элементов с числами
        filteredList.sort((a, b) => {
            // Извлекаем числовые значения из строк
            const aMatch = a.value.match(/\d+/);
            const bMatch = b.value.match(/\d+/);

            if (aMatch && bMatch) {
                const aNum = parseInt(aMatch[0], 10);
                const bNum = parseInt(bMatch[0], 10);
                return aNum - bNum;
            }

            return a.numericValue - b.numericValue;
        });
    } else {
        filteredList.sort((a, b) => {
            return a.numericValue - b.numericValue;
        });
    }

    // Применяем пользовательский порядок только если нет поиска или есть заранее сохраненный порядок для этого поискового запроса
    if (shouldUseStoredOrder) {
        if (search && state.searchFilters[searchKey] && state.searchFilters[searchKey].length > 0) {
            const searchOrderMap = new Map();
            const customOrder = state.searchFilters[searchKey];

            customOrder.forEach((id, index) => {
                searchOrderMap.set(id, index);
            });

            const customOrderedItems = [];
            const remainingItems = [];

            filteredList.forEach(item => {
                if (searchOrderMap.has(item.id)) {
                    customOrderedItems.push(item);
                } else {
                    remainingItems.push(item);
                }
            });

            customOrderedItems.sort((a, b) => {
                return searchOrderMap.get(a.id) - searchOrderMap.get(b.id);
            });

            filteredList = [...customOrderedItems, ...remainingItems];
        } else if (state.customOrder.length > 0 && !search) {
            const positionMap = new Map();
            state.customOrder.forEach((id, index) => {
                positionMap.set(id, index);
            });

            const customOrderedItems = [];
            const remainingItems = [];

            filteredList.forEach(item => {
                if (positionMap.has(item.id)) {
                    customOrderedItems.push(item);
                } else {
                    remainingItems.push(item);
                }
            });

            customOrderedItems.sort((a, b) => {
                return positionMap.get(a.id) - positionMap.get(b.id);
            });

            filteredList = [...customOrderedItems, ...remainingItems];
        }
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
        total: totalCount,
        search: search
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
        const customOrderSet = new Set(state.customOrder);

        const remainingIds = fullList
            .map(item => item.id)
            .filter(id => !customOrderSet.has(id));

        orderedIds = [...state.customOrder, ...remainingIds];
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
    const { selectedIds = [], customOrder = [], orderChanges = null, search = '' } = req.body;
    const searchKey = search ? search.toLowerCase() : '';

    // Сохраняем выбранные ID
    state.selectedIds = [...new Set(selectedIds)];

    // Если активен поиск и передан пустой search, значит клиент решил не сохранять порядок для поиска
    if (search === '') {
        // Используем только сохранение основного порядка или выбранных элементов
        if (customOrder && customOrder.length > 0) {
            state.customOrder = [...new Set(customOrder)];
        }
        else if (orderChanges && !search) {
            const { itemId, oldIndex, newIndex } = orderChanges;

            if (state.customOrder.length === 0) {
                state.customOrder = fullList.map(item => item.id);
            }

            if (oldIndex !== newIndex && itemId) {
                state.customOrder = state.customOrder.filter(id => id !== itemId);

                if (newIndex >= 0 && newIndex <= state.customOrder.length) {
                    state.customOrder.splice(newIndex, 0, itemId);
                } else {
                    state.customOrder.push(itemId);
                }
            }
        }
    }
    // Сохраняем состояние для конкретного поискового запроса
    else if (search && customOrder && customOrder.length > 0) {
        state.searchFilters[searchKey] = [...new Set(customOrder)];
    }

    res.sendStatus(200);
});

// GET /get-state
router.get('/get-state', (req, res) => {
    const uniqueSelectedIds = [...new Set(state.selectedIds)];

    res.json({
        selectedIds: uniqueSelectedIds,
        customOrderLength: state.customOrder.length,
        searchFiltersCount: Object.keys(state.searchFilters).length
    });
});

// ЭНДПОИНТ: Получение фрагмента пользовательского порядка
router.get('/custom-order', (req, res) => {
    const { start = 0, count = 1000, search = '' } = req.query;
    const startIndex = parseInt(start, 10);
    const itemCount = Math.min(parseInt(count, 10), 5000);
    const searchKey = search ? search.toLowerCase() : '';

    let orderToUse;
    if (search && state.searchFilters[searchKey]) {
        orderToUse = state.searchFilters[searchKey];
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
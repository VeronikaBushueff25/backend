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
    customOrder: [],
    // Добавляем хранение информации о порядке в рамках поиска
    searchFilters: {}
};

// GET /items?search=...&offset=...&limit=...
router.get('/', (req, res) => {
    const { search = '', offset = 0, limit = 20, useStoredOrder = 'true' } = req.query;
    const numOffset = parseInt(offset, 10);
    const numLimit = parseInt(limit, 10);
    const shouldUseStoredOrder = useStoredOrder === 'true';
    const searchKey = search.toLowerCase();

    let filteredList = [...fullList];

    // Сначала фильтруем по поиску
    if (search) {
        filteredList = filteredList.filter(item =>
            item.value.toLowerCase().includes(searchKey)
        );
    }

    // Применяем пользовательский порядок, если он существует и запрошен
    if (shouldUseStoredOrder) {
        if (search && state.searchFilters[searchKey]) {
            // Используем порядок, специфичный для текущего поискового запроса
            const searchOrderMap = new Map();
            state.searchFilters[searchKey].forEach((id, index) => {
                searchOrderMap.set(id, index);
            });

            filteredList.sort((a, b) => {
                const posA = searchOrderMap.has(a.id) ? searchOrderMap.get(a.id) : a.position;
                const posB = searchOrderMap.has(b.id) ? searchOrderMap.get(b.id) : b.position;
                return posA - posB;
            });
        } else if (state.customOrder.length > 0 && !search) {
            // Для полного списка (без поиска) используем общий порядок
            const positionMap = new Map();
            state.customOrder.forEach((id, index) => {
                positionMap.set(id, index);
            });

            filteredList.sort((a, b) => {
                const posA = positionMap.has(a.id) ? positionMap.get(a.id) : Infinity;
                const posB = positionMap.has(b.id) ? positionMap.get(b.id) : Infinity;

                if (posA === Infinity && posB === Infinity) {
                    // Оба элемента не в пользовательском порядке, используем исходный порядок
                    return a.position - b.position;
                }
                return posA - posB;
            });
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
        search: search // Передаем текущий поисковый запрос
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

    state.selectedIds = [...new Set(selectedIds)];

    if (customOrder && customOrder.length > 0) {
        if (search) {
            // Сохраняем порядок для конкретного поискового запроса
            state.searchFilters[searchKey] = [...new Set(customOrder)];
        } else {
            // Сохраняем общий порядок (без поиска)
            state.customOrder = [...new Set(customOrder)];
        }
    }
    else if (orderChanges) {
        const { itemId, oldIndex, newIndex } = orderChanges;

        if (search) {
            // Работаем с порядком для текущего поискового запроса
            if (!state.searchFilters[searchKey]) {
                // Если еще нет сохраненного порядка для этого поиска,
                // создаем его из отфильтрованных элементов
                const filteredIds = fullList
                    .filter(item => item.value.toLowerCase().includes(searchKey))
                    .map(item => item.id);

                state.searchFilters[searchKey] = filteredIds;
            }

            const currentOrder = [...state.searchFilters[searchKey]];

            // Выполняем изменение порядка
            if (oldIndex !== newIndex && itemId) {
                // Удаляем элемент со старой позиции
                const filteredOrder = currentOrder.filter(id => id !== itemId);

                // Вставляем элемент на новую позицию
                if (newIndex >= 0 && newIndex <= filteredOrder.length) {
                    filteredOrder.splice(newIndex, 0, itemId);
                } else {
                    filteredOrder.push(itemId);
                }

                state.searchFilters[searchKey] = filteredOrder;
            }
        } else {
            // Работаем с общим порядком (без поиска)
            if (state.customOrder.length === 0) {
                state.customOrder = fullList.map(item => item.id);
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
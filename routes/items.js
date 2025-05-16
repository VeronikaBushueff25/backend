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
    // Новая структура для хранения контекстных позиций
    contextualPositions: []
};

// GET /items?search=...&offset=...&limit=...
router.get('/', (req, res) => {
    const { search = '', offset = 0, limit = 20, useStoredOrder = 'true' } = req.query;
    const numOffset = parseInt(offset, 10);
    const numLimit = parseInt(limit, 10);
    const shouldUseStoredOrder = useStoredOrder === 'true';

    let filteredList = [...fullList];

    // Сначала фильтруем по поиску до применения сортировки
    if (search) {
        filteredList = filteredList.filter(item =>
            item.value.toLowerCase().includes(search.toLowerCase())
        );
    }

    // Применяем пользовательский порядок и контекстные позиции
    if (shouldUseStoredOrder) {
        // Сперва применяем контекстные позиции
        if (state.contextualPositions.length > 0) {
            // Создаем карту для быстрого поиска элементов
            const itemMap = new Map(filteredList.map(item => [item.id, item]));

            // Сначала создаем базовый список в исходном порядке
            let baseOrderIds = filteredList.map(item => item.id);

            // Обрабатываем контекстные позиции от новых к старым (по timestamp)
            const sortedContextPositions = [...state.contextualPositions]
                .sort((a, b) => b.timestamp - a.timestamp);

            // Для каждой контекстной позиции
            for (const contextPos of sortedContextPositions) {
                const { itemId, prevItemId, nextItemId } = contextPos;

                // Проверяем, существует ли перемещаемый элемент в отфильтрованном списке
                if (!itemMap.has(itemId)) continue;

                // Удаляем элемент из текущей позиции
                baseOrderIds = baseOrderIds.filter(id => id !== itemId);

                // Определяем новую позицию для вставки
                if (prevItemId !== null && nextItemId !== null) {
                    // Случай 1: Есть и предыдущий, и следующий элементы
                    if (itemMap.has(prevItemId) && itemMap.has(nextItemId)) {
                        // Ищем индекс следующего элемента (должен быть после предыдущего)
                        const prevIndex = baseOrderIds.indexOf(prevItemId);
                        const nextIndex = baseOrderIds.indexOf(nextItemId);

                        if (prevIndex !== -1 && nextIndex !== -1 && nextIndex > prevIndex) {
                            // Идеальный случай - оба элемента есть и в правильном порядке
                            baseOrderIds.splice(prevIndex + 1, 0, itemId);
                        } else if (prevIndex !== -1) {
                            // Только предыдущий элемент найден
                            baseOrderIds.splice(prevIndex + 1, 0, itemId);
                        } else if (nextIndex !== -1) {
                            // Только следующий элемент найден
                            baseOrderIds.splice(nextIndex, 0, itemId);
                        } else {
                            // Оба элемента не найдены - добавляем в начало
                            baseOrderIds.unshift(itemId);
                        }
                    } else if (itemMap.has(prevItemId)) {
                        // Только предыдущий элемент существует
                        const index = baseOrderIds.indexOf(prevItemId);
                        if (index !== -1) {
                            baseOrderIds.splice(index + 1, 0, itemId);
                        } else {
                            baseOrderIds.unshift(itemId);
                        }
                    } else if (itemMap.has(nextItemId)) {
                        // Только следующий элемент существует
                        const index = baseOrderIds.indexOf(nextItemId);
                        if (index !== -1) {
                            baseOrderIds.splice(index, 0, itemId);
                        } else {
                            baseOrderIds.unshift(itemId);
                        }
                    } else {
                        // Ни один из соседних элементов не существует
                        baseOrderIds.unshift(itemId);
                    }
                } else if (prevItemId !== null) {
                    // Случай 2: Есть только предыдущий элемент
                    if (itemMap.has(prevItemId)) {
                        const index = baseOrderIds.indexOf(prevItemId);
                        if (index !== -1) {
                            baseOrderIds.splice(index + 1, 0, itemId);
                        } else {
                            baseOrderIds.push(itemId);
                        }
                    } else {
                        baseOrderIds.push(itemId);
                    }
                } else if (nextItemId !== null) {
                    // Случай 3: Есть только следующий элемент
                    if (itemMap.has(nextItemId)) {
                        const index = baseOrderIds.indexOf(nextItemId);
                        if (index !== -1) {
                            baseOrderIds.splice(index, 0, itemId);
                        } else {
                            baseOrderIds.unshift(itemId);
                        }
                    } else {
                        baseOrderIds.unshift(itemId);
                    }
                } else {
                    // Случай 4: Нет контекстной информации
                    baseOrderIds.unshift(itemId);
                }
            }

            // Преобразуем обратно в список элементов
            filteredList = baseOrderIds
                .map(id => itemMap.get(id))
                .filter(item => item !== undefined);
        }
        // Затем применяем обычную сортировку по customOrder, если есть
        else if (state.customOrder.length > 0) {
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
        const { itemId, oldIndex, newIndex, contextItems } = orderChanges;

        // Обновляем customOrder для обратной совместимости
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

        // Сохраняем контекстную информацию, если она была предоставлена
        if (contextItems && (contextItems.prevItemId !== null || contextItems.nextItemId !== null)) {
            // Удаляем старую запись о позиции элемента, если она существует
            state.contextualPositions = state.contextualPositions.filter(
                item => item.itemId !== itemId
            );

            // Проверяем, что хотя бы один из контекстных элементов не равен null
            // Добавляем новую запись о контекстной позиции
            state.contextualPositions.push({
                itemId,
                prevItemId: contextItems.prevItemId,
                nextItemId: contextItems.nextItemId,
                timestamp: Date.now() // Добавляем временную метку для отслеживания последних изменений
            });

            // Сохраняем максимум 1000 последних изменений
            if (state.contextualPositions.length > 1000) {
                state.contextualPositions.sort((a, b) => b.timestamp - a.timestamp);
                state.contextualPositions = state.contextualPositions.slice(0, 1000);
            }

            // Логирование для отладки
            console.log(`Saved contextual position: Item ${itemId} between ${contextItems.prevItemId} and ${contextItems.nextItemId}`);
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
        customOrderLength: uniqueCustomOrder.length,
        contextualPositionsCount: state.contextualPositions.length
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
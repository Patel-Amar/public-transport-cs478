export class MinHeap<T> {
    private heap: T[] = [];

    constructor(private comparator: (a: T, b: T) => number) {}

    push(value: T) {
        this.heap.push(value);
        this.bubbleUp();
    }

    pop(): T | undefined {
        if (this.heap.length === 0) return undefined;
        if (this.heap.length === 1) return this.heap.pop();

        const top = this.heap[0];
        this.heap[0] = this.heap.pop()!;
        this.sinkDown(0);
        return top;
    }

    isEmpty(): boolean {
        return this.heap.length === 0;
    }

    private bubbleUp() {
        let index = this.heap.length - 1;
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.comparator(this.heap[index], this.heap[parentIndex]) >= 0)
                break;
            [this.heap[index], this.heap[parentIndex]] = [
                this.heap[parentIndex],
                this.heap[index],
            ];
            index = parentIndex;
        }
    }

    private sinkDown(index: number) {
        const length = this.heap.length;
        while (true) {
            let left = 2 * index + 1,
                right = 2 * index + 2,
                smallest = index;

            if (
                left < length &&
                this.comparator(this.heap[left], this.heap[smallest]) < 0
            )
                smallest = left;
            if (
                right < length &&
                this.comparator(this.heap[right], this.heap[smallest]) < 0
            )
                smallest = right;

            if (smallest === index) break;
            [this.heap[index], this.heap[smallest]] = [
                this.heap[smallest],
                this.heap[index],
            ];
            index = smallest;
        }
    }
}

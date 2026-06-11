/**
 * Union-Find (并查集) 数据结构
 * 用于高效的集合合并和查询操作
 *
 * 特性：
 * - 路径压缩：查找时将节点直接连接到根节点
 * - 按秩合并：合并时将较小的树连接到较大的树
 * - 时间复杂度：接近 O(1) 的均摊时间
 */
export class UnionFind {
  private parent: Map<string, string>;
  private rank: Map<string, number>;

  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  /**
   * 添加一个新元素
   */
  add(id: string): void {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
    }
  }

  /**
   * 查找元素所属的集合（根节点）
   * 使用路径压缩优化
   */
  find(id: string): string {
    if (!this.parent.has(id)) {
      this.add(id);
    }

    // 路径压缩：将路径上的所有节点直接连接到根节点
    if (this.parent.get(id) !== id) {
      this.parent.set(id, this.find(this.parent.get(id)!));
    }

    return this.parent.get(id)!;
  }

  /**
   * 合并两个元素所属的集合
   * 使用按秩合并优化
   */
  union(id1: string, id2: string): void {
    const root1 = this.find(id1);
    const root2 = this.find(id2);

    if (root1 === root2) return;

    // 按秩合并：将较小的树连接到较大的树
    const rank1 = this.rank.get(root1) || 0;
    const rank2 = this.rank.get(root2) || 0;

    if (rank1 < rank2) {
      this.parent.set(root1, root2);
    } else if (rank1 > rank2) {
      this.parent.set(root2, root1);
    } else {
      this.parent.set(root2, root1);
      this.rank.set(root1, rank1 + 1);
    }
  }

  /**
   * 检查两个元素是否属于同一集合
   */
  connected(id1: string, id2: string): boolean {
    return this.find(id1) === this.find(id2);
  }

  /**
   * 获取所有集合（按根节点分组）
   */
  getClusters(): Map<string, string[]> {
    const clusters = new Map<string, string[]>();

    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!clusters.has(root)) {
        clusters.set(root, []);
      }
      clusters.get(root)!.push(id);
    }

    return clusters;
  }

  /**
   * 获取集合数量
   */
  getClusterCount(): number {
    const roots = new Set<string>();
    for (const id of this.parent.keys()) {
      roots.add(this.find(id));
    }
    return roots.size;
  }
}

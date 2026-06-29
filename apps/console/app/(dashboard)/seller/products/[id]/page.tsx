'use client';

import type { CreateVariantRequest, Product, ProductVariant } from '@doa/shared-types';
import { ApiError } from '@doa/api-client';
import { Button, Card, ErrorText, Input, Loading } from '@doa/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function ProductManagePage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const queryClient = useQueryClient();
  const { sellerStatus } = useAuth();

  const detail = useQuery({
    queryKey: ['product', productId],
    queryFn: () => api.catalog.getProduct(productId),
    retry: false,
  });

  const refetchAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['product', productId] });
    await queryClient.invalidateQueries({ queryKey: ['seller', 'products'] });
  };

  const publish = useMutation({
    mutationFn: () => api.catalog.publishProduct(productId),
    onSuccess: refetchAll,
  });
  const deactivate = useMutation({
    mutationFn: () => api.catalog.deactivateProduct(productId),
    onSuccess: refetchAll,
  });

  // GET /products/:id 는 ACTIVE/OUT_OF_STOCK 만 반환 → DRAFT/INACTIVE 는 404(BE-GAP-003).
  const notFound = detail.error instanceof ApiError && detail.error.status === 404;

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/seller/products" className="text-sm text-muted-foreground hover:text-foreground">
        ← 내 상품
      </Link>

      {detail.isLoading && <Loading />}

      {notFound && (
        <DraftPanel
          productId={productId}
          onPublish={() => publish.mutate()}
          publishing={publish.isPending}
          publishError={publish.error}
          onAddVariant={refetchAll}
          approved={sellerStatus === 'APPROVED'}
        />
      )}

      {detail.data && (
        <>
          <ProductHeader
            product={detail.data}
            onDeactivate={() => deactivate.mutate()}
            deactivating={deactivate.isPending}
          />
          <VariantSection
            productId={productId}
            variants={detail.data.variants ?? []}
            approved={sellerStatus === 'APPROVED'}
            onChange={refetchAll}
          />
        </>
      )}
    </div>
  );
}

function ProductHeader({
  product,
  onDeactivate,
  deactivating,
}: {
  product: Product;
  onDeactivate: () => void;
  deactivating: boolean;
}) {
  return (
    <Card className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{product.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {product.status} · 기본가 {product.price}
        </p>
      </div>
      {product.status === 'ACTIVE' && (
        <Button variant="secondary" size="sm" onClick={onDeactivate} disabled={deactivating}>
          {deactivating ? '처리 중…' : '비활성화'}
        </Button>
      )}
    </Card>
  );
}

function DraftPanel({
  productId,
  onPublish,
  publishing,
  publishError,
  onAddVariant,
  approved,
}: {
  productId: string;
  onPublish: () => void;
  publishing: boolean;
  publishError: unknown;
  onAddVariant: () => void;
  approved: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-card border border-warning bg-warning-soft p-6">
        <h1 className="text-lg font-semibold text-warning-foreground">DRAFT / INACTIVE 상품</h1>
        <p className="mt-1 text-sm text-warning-foreground">
          이 상태의 상품은 상세 조회 API(`GET /products/:id`)로 조회할 수 없습니다(BE-GAP-003).
          옵션을 추가한 뒤 게시하면 전체 관리 화면이 표시됩니다.
        </p>
        <Button onClick={onPublish} disabled={publishing} className="mt-4">
          {publishing ? '게시 중…' : '게시(publish)'}
        </Button>
        {publishError instanceof ApiError && (
          <p className="mt-2 text-sm text-danger">{publishError.message}</p>
        )}
      </div>

      <AddVariantForm productId={productId} approved={approved} onAdded={onAddVariant} />
    </div>
  );
}

function VariantSection({
  productId,
  variants,
  approved,
  onChange,
}: {
  productId: string;
  variants: ProductVariant[];
  approved: boolean;
  onChange: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">옵션 · 재고</h2>

      {variants.length === 0 ? (
        <p className="text-sm text-subtle-foreground">등록된 옵션이 없습니다.</p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {variants.map((v) => (
            <VariantRow key={v.id} variant={v} approved={approved} />
          ))}
        </div>
      )}

      <AddVariantForm productId={productId} approved={approved} onAdded={onChange} />
    </div>
  );
}

function VariantRow({ variant, approved }: { variant: ProductVariant; approved: boolean }) {
  const queryClient = useQueryClient();
  const [qty, setQty] = useState('');

  const stock = useQuery({
    queryKey: ['stock', variant.id],
    queryFn: () => api.inventory.getStock(variant.id),
    enabled: approved,
  });

  const stockIn = useMutation({
    mutationFn: (quantity: number) => api.inventory.stockIn(variant.id, { quantity }),
    onSuccess: async () => {
      setQty('');
      await queryClient.invalidateQueries({ queryKey: ['stock', variant.id] });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    if (Number.isInteger(n) && n >= 1) stockIn.mutate(n);
  }

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">
          {variant.optionName} · {variant.optionValue}
        </div>
        <div className="truncate text-xs text-subtle-foreground">
          {variant.sku} · {variant.price}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          재고 {approved ? (stock.isLoading ? '…' : (stock.data ?? 0)) : '—'}
        </span>
        {approved && (
          <form onSubmit={submit} className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="수량"
              className="w-20 rounded-lg border border-border px-2 py-1 text-sm outline-none focus:border-ring"
            />
            <Button type="submit" size="sm" disabled={stockIn.isPending}>
              입고
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function AddVariantForm({
  productId,
  approved,
  onAdded,
}: {
  productId: string;
  approved: boolean;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({
    optionName: '',
    optionValue: '',
    sku: '',
    price: '',
    initialStock: '',
  });
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: (body: CreateVariantRequest) => api.catalog.addVariant(productId, body),
    onSuccess: () => {
      setForm({ optionName: '', optionValue: '', sku: '', price: '', initialStock: '' });
      onAdded();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '옵션 추가 실패'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) return setError('가격을 올바르게 입력하세요.');
    const initialStock = form.initialStock ? Number(form.initialStock) : undefined;
    add.mutate({
      optionName: form.optionName,
      optionValue: form.optionValue,
      sku: form.sku,
      price,
      initialStock,
    });
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) =>
      setForm((s) => ({ ...s, [key]: e.target.value })),
  });

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm font-medium text-foreground">옵션 추가</div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="옵션명" required {...field('optionName')} />
          <Input label="옵션값" required {...field('optionValue')} />
          <Input label="SKU" required {...field('sku')} />
          <Input label="가격" type="number" min={0} required {...field('price')} />
          <Input label="초기 재고(선택)" type="number" min={0} {...field('initialStock')} />
        </div>
        {!approved && (
          <p className="text-xs text-warning">※ 옵션 추가는 APPROVED 판매자만 가능합니다.</p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? '추가 중…' : '옵션 추가'}
        </Button>
      </form>
    </Card>
  );
}

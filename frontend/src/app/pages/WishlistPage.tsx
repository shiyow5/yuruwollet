import { WishlistBoard } from '../../features/wishlist/WishlistBoard';

export function WishlistPage() {
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="font-headline-md text-headline-md font-bold text-custom-text">
          二人のウィッシュリスト
        </h2>
        <p className="text-body-md text-custom-text/70">
          ほしい物も、行きたい場所も。叶えたら思い出に残そう。
        </p>
      </header>

      <WishlistBoard />
    </section>
  );
}

import PublicNav from '@/app/components/public/PublicNav';
import CourtsDirectory from '@/app/components/public/CourtsDirectory';
import PublicFooter from '@/app/components/public/PublicFooter';

export default function UserCourtsPage() {
  return (
    <>
      <PublicNav alwaysVisible />
      <main className="flex-1">
        <CourtsDirectory />
      </main>
      <PublicFooter compact />
    </>
  );
}

import PublicNav from '@/app/components/public/PublicNav';
import CourtsDirectory from '@/app/components/public/CourtsDirectory';
import PublicFooter from '@/app/components/public/PublicFooter';

export default function UserCourtsPage() {
  return (
    <>
      <PublicNav alwaysVisible />
      <CourtsDirectory />
      <PublicFooter compact />
    </>
  );
}

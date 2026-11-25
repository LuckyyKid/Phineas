using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Phineas.Data.Migrations
{
    /// <inheritdoc />
    public partial class ProspectsDoublonsUniques : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Prospects_DealershipId_Courriel",
                table: "Prospects");

            migrationBuilder.DropIndex(
                name: "IX_Prospects_DealershipId_TelephoneChiffres",
                table: "Prospects");

            migrationBuilder.CreateIndex(
                name: "IX_Prospects_DealershipId_Courriel",
                table: "Prospects",
                columns: new[] { "DealershipId", "Courriel" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Prospects_DealershipId_TelephoneChiffres",
                table: "Prospects",
                columns: new[] { "DealershipId", "TelephoneChiffres" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Prospects_DealershipId_Courriel",
                table: "Prospects");

            migrationBuilder.DropIndex(
                name: "IX_Prospects_DealershipId_TelephoneChiffres",
                table: "Prospects");

            migrationBuilder.CreateIndex(
                name: "IX_Prospects_DealershipId_Courriel",
                table: "Prospects",
                columns: new[] { "DealershipId", "Courriel" });

            migrationBuilder.CreateIndex(
                name: "IX_Prospects_DealershipId_TelephoneChiffres",
                table: "Prospects",
                columns: new[] { "DealershipId", "TelephoneChiffres" });
        }
    }
}
